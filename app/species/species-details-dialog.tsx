import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { createBrowserSupabaseClient } from "@/lib/client-utils";
import type { Database } from "@/lib/schema";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useEffect, useState } from "react";

type Species = Database["public"]["Tables"]["species"]["Row"];
type Comment = Database["public"]["Tables"]["comments"]["Row"];

const KINGDOMS: Species["kingdom"][] = ["Animalia", "Plantae", "Fungi", "Protista", "Archaea", "Bacteria"];

// Trim and handle blanks
function textOrNull(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

// Abstraction of field names rendering
function EditableField({
  name,
  value,
  type,
}: {
  name: string;
  //Null so we can edit fields with no value yet
  value: string | number | null;
  type: "select" | "textarea" | "input";
}) {
  if (type === "select") {
    return (
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className="block w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
      >
        {KINGDOMS.map((kingdom) => (
          <option key={kingdom} value={kingdom}>
            {kingdom}
          </option>
        ))}
      </select>
    );
  }
  if (type === "textarea") {
    return <Textarea id={name} name={name} defaultValue={value ?? ""} rows={4} />;
  }
  return <Input id={name} name={name} defaultValue={value ?? ""} />;
}

export default function SpeciesDetailsDialog({
  localSpecies,
  setLocalSpecies,
  userId,
}: {
  localSpecies: Species;
  setLocalSpecies: Dispatch<SetStateAction<Species>>;
  userId: string;
}) {
  const fieldConfig = [
    { label: "Common name", name: "common_name" as const, value: localSpecies.common_name, type: "input" as const },
    {
      label: "Total population",
      name: "total_population" as const,
      value: localSpecies.total_population,
      type: "input" as const,
    },
    { label: "Kingdom", name: "kingdom" as const, value: localSpecies.kingdom, type: "select" as const },
    { label: "Description", name: "description" as const, value: localSpecies.description, type: "textarea" as const },
  ];
  const [editMode, setEditMode] = useState(false);
  const router = useRouter();

  // Track if open, so comments aren't fetched for every card
  const [open, setOpen] = useState(false);
  const [localComments, setLocalComments] = useState<Comment[]>([]);

  //pull the comments on opening
  useEffect(() => {
    if (!open) return;
    const supabase = createBrowserSupabaseClient();
    void supabase
      .from("comments")
      .select("*")
      .eq("species_id", localSpecies.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setLocalComments(data ?? []));
  }, [open, localSpecies.id]);

  const handleCommentDelete = async (commentId: number) => {
    // Drop it from the list right away, and put it back if the delete doesn't land
    const previousComments = localComments;
    setLocalComments(localComments.filter((comment) => comment.id !== commentId));

    const supabase = createBrowserSupabaseClient();

    // .select() to catch success 0 rows
    const { data, error } = await supabase.from("comments").delete().eq("id", commentId).select();

    if (error !== null || data === null || data.length === 0) {
      setLocalComments(previousComments);
      toast({
        title: "Failed to delete comment",
        description: error?.message ?? "The comment was not deleted.",
        variant: "destructive",
      });
      return;
    }

    router.refresh();
  };

  const handleCommentPost = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    //get the form data right away, to prevent loss
    const form = e.currentTarget;
    const content = String(new FormData(form).get("content") ?? "").trim();
    if (content.length === 0) return;

    const supabase = createBrowserSupabaseClient();

    const { data, error } = await supabase
      .from("comments")
      .insert({ species_id: localSpecies.id, author: userId, content })
      .select();

    if (error !== null || data === null || data.length === 0) {
      toast({
        title: "Failed to post comment",
        description: error?.message ?? "The comment was not saved.",
        variant: "destructive",
      });
      return;
    }

    // Immediately display the comment on front end, and update the backend
    setLocalComments([...data, ...localComments]);
    form.reset();
    router.refresh();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const supabase = createBrowserSupabaseClient();

    // Blank field does not equal 0 (in population)
    const rawPopulation = String(formData.get("total_population") ?? "").trim();
    const totalPopulation = rawPopulation === "" ? null : Number(rawPopulation);

    // Check to see not null for population
    if (totalPopulation !== null && (!Number.isInteger(totalPopulation) || totalPopulation < 0)) {
      toast({
        title: "Invalid total population",
        description: "Enter a whole number of 0 or more, or leave it blank if the population is unknown.",
        variant: "destructive",
      });
      return;
    }

    const updated = {
      common_name: textOrNull(formData.get("common_name")),
      total_population: totalPopulation,
      kingdom: formData.get("kingdom") as Species["kingdom"],
      description: textOrNull(formData.get("description")),
    };

    const previousSpecies = localSpecies;
    setLocalSpecies({ ...localSpecies, ...updated });
    setEditMode(false);

    // .select() to avoid success with 0 rows edited
    const { data, error } = await supabase.from("species").update(updated).eq("id", localSpecies.id).select();

    if (error ?? (!data || data.length === 0)) {
      setLocalSpecies(previousSpecies);
      setEditMode(true);
      toast({
        title: "Failed to update species",
        description: error?.message ?? "The update was not applied.",
        variant: "destructive",
      });
    } else {
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="mt-3 w-full">Learn More</Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{localSpecies.scientific_name}</DialogTitle>
        </DialogHeader>
        {/*conditional rendering based on if the user is editing the species*/}
        {editMode ? (
          <form onSubmit={(e) => void handleSubmit(e)}>
            {/* Every field gets an input, including ones that are currently empty, so they can be filled in */}
            {fieldConfig.map(({ label, name, value, type }) => (
              <div key={name} className="mb-2">
                <label htmlFor={name} className="text-sm font-medium">
                  {label}
                </label>
                <EditableField name={name} value={value} type={type} />
              </div>
            ))}
            <div className="flex justify-between">
              <Button type="submit">Save</Button>
              <Button type="button" onClick={() => setEditMode(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            {fieldConfig.map(
              ({ label, value }) =>
                value !== null && (
                  <p key={label}>
                    {label}: {value}
                  </p>
                ),
            )}
            {userId === localSpecies.author && <Button onClick={() => setEditMode(true)}>Edit The Specie</Button>}
          </>
        )}
        <h2 className="mt-4 text-lg font-semibold">Comments</h2>
        <form onSubmit={(e) => void handleCommentPost(e)}>
          <textarea
            name="content"
            aria-label="leave a comment"
            rows={3}
            className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
          />
          <Button type="submit" className="mt-2">
            Post Comment
          </Button>
        </form>
        {localComments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          localComments.map((comment) => (
            <div key={comment.id} className="relative mt-2 rounded border p-2 pr-8">
              <p className="text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleString()}</p>
              <p className="text-sm">{comment.content}</p>
              {comment.author === userId && (
                <button
                  type="button"
                  title="Delete comment"
                  aria-label="Delete comment"
                  onClick={() => void handleCommentDelete(comment.id)}
                  className="absolute right-1 top-1 rounded p-1 text-red-500 hover:bg-red-500/10 hover:text-red-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
      </DialogContent>
    </Dialog>
  );
}
