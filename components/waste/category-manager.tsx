"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createCategory, deleteCategory, updateCategory } from "@/app/(app)/waste/actions";

export interface CategoryRow {
  id: string;
  name: string;
  sort: number;
}

function CategoryEditRow({ category }: { category: CategoryRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(category.name);
  const [sort, setSort] = useState(String(category.sort));
  const [error, setError] = useState<string | null>(null);

  return (
    <TableRow>
      <TableCell>
        <Input
          aria-label="Category name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="max-w-[14rem]"
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label="Sort order"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="max-w-[5rem]"
          inputMode="numeric"
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await updateCategory({
                  id: category.id,
                  name,
                  sort: Number(sort) || 0,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            {isPending ? "..." : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              if (
                !window.confirm(
                  `Delete category "${category.name}"? It must have no items left in it.`,
                )
              ) {
                return;
              }
              setError(null);
              startTransition(async () => {
                const result = await deleteCategory({ id: category.id });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            Delete
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Admin CRUD for waste_categories (PLAN.md S5: "admin CRUD"). */
export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [sort, setSort] = useState("0");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Sort</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category) => (
            <CategoryEditRow key={category.id} category={category} />
          ))}
          {categories.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No categories yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createCategory({ name, sort: Number(sort) || 0 });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setName("");
            setSort("0");
            router.refresh();
          });
        }}
      >
        <Input
          aria-label="New category name"
          placeholder="Category name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="max-w-[14rem]"
          required
        />
        <Input
          aria-label="New category sort order"
          placeholder="Sort"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="max-w-[5rem]"
          inputMode="numeric"
        />
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? "Adding..." : "Add category"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
