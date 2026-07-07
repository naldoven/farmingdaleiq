import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TemplateCreateForm } from "@/components/checklists/template-create-form";
import { FoodItemsManager } from "@/components/checklists/food-items-manager";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /checklists/templates -- ARCHITECTURE.md page map: "Build/edit templates,
 * sections, questions, schedules (permission-gated)." checklists.manage_
 * templates is required for the whole route (create/list here, edit inside
 * app/(app)/checklists/templates/[templateId]/page.tsx).
 */
export default async function ChecklistTemplatesPage() {
  await requirePermission("checklists.manage_templates");

  const supabase = await createClient();

  const [{ data: templates }, { data: sections }, { data: schedules }, { data: foodItems }] =
    await Promise.all([
      supabase
        .from("checklist_templates")
        .select("id, name, description, active")
        .order("name"),
      supabase.from("checklist_sections").select("id, template_id"),
      supabase.from("checklist_schedules").select("id, template_id, frequency"),
      supabase
        .from("food_items")
        .select("id, name, cold_min_f, cold_max_f, hot_min_f, hot_max_f")
        .order("name"),
    ]);

  const sectionCountByTemplate = new Map<string, number>();
  for (const s of sections ?? []) {
    sectionCountByTemplate.set(s.template_id, (sectionCountByTemplate.get(s.template_id) ?? 0) + 1);
  }
  const scheduleCountByTemplate = new Map<string, number>();
  for (const s of schedules ?? []) {
    scheduleCountByTemplate.set(s.template_id, (scheduleCountByTemplate.get(s.template_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Checklist templates</h1>
        <Link href="/checklists" className="text-sm text-muted-foreground hover:underline">
          &larr; Today&apos;s checklists
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New template</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateCreateForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Sections</TableHead>
                <TableHead>Schedules</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(templates ?? []).map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <Link
                      href={`/checklists/templates/${template.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {template.name}
                    </Link>
                    {template.description && (
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                    )}
                  </TableCell>
                  <TableCell>{sectionCountByTemplate.get(template.id) ?? 0}</TableCell>
                  <TableCell>{scheduleCountByTemplate.get(template.id) ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={template.active ? "success" : "outline"}>
                      {template.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(templates ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No templates yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Food items</CardTitle>
        </CardHeader>
        <CardContent>
          <FoodItemsManager
            foodItems={(foodItems ?? []).map((f) => ({
              id: f.id,
              name: f.name,
              coldMinF: f.cold_min_f,
              coldMaxF: f.cold_max_f,
              hotMinF: f.hot_min_f,
              hotMaxF: f.hot_max_f,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
