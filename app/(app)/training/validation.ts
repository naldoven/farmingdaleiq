import { z } from "zod";

/** Input validation for /training server actions (passports, items,
 * enrollment, item progress, stamping, courses). */

export const passportItemTypeSchema = z.enum(["check", "slider", "photo", "signature", "course"]);

export const createPassportItemSchema = z.object({
  passportId: z.string().uuid(),
  type: passportItemTypeSchema,
  label: z.string().trim().min(1, "Label is required"),
  sort: z.number().int().min(0).default(0),
  courseId: z.string().uuid().nullable().optional(),
});
export type CreatePassportItemInput = z.infer<typeof createPassportItemSchema>;

export const deletePassportItemSchema = z.object({ id: z.string().uuid() });
export type DeletePassportItemInput = z.infer<typeof deletePassportItemSchema>;

export const enrollPassportSchema = z.object({
  passportId: z.string().uuid(),
  userId: z.string().uuid(),
  track: z.string().trim().max(100).optional().or(z.literal("")),
});
export type EnrollPassportInput = z.infer<typeof enrollPassportSchema>;

export const upsertItemProgressSchema = z.object({
  enrollmentId: z.string().uuid(),
  itemId: z.string().uuid(),
  checked: z.boolean().optional(),
  sliderValue: z.number().min(0).max(100).optional(),
  photoUrl: z.string().trim().max(2000).optional(),
});
export type UpsertItemProgressInput = z.infer<typeof upsertItemProgressSchema>;

export const signItemSchema = z.object({
  enrollmentId: z.string().uuid(),
  itemId: z.string().uuid(),
});
export type SignItemInput = z.infer<typeof signItemSchema>;

export const stampPassportSchema = z.object({ enrollmentId: z.string().uuid() });
export type StampPassportInput = z.infer<typeof stampPassportSchema>;

export const createCourseSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  content: z.string().trim().max(20000).optional().or(z.literal("")),
  vendorId: z.string().uuid().nullable().optional(),
  sort: z.number().int().min(0).default(0),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const submitCourseFeedbackSchema = z.object({
  courseId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  feedback: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type SubmitCourseFeedbackInput = z.infer<typeof submitCourseFeedbackSchema>;

export const createCourseAttachmentSchema = z.object({
  courseId: z.string().uuid(),
  fileUrl: z.string().trim().min(1, "File URL is required").max(2000),
  label: z.string().trim().max(200).optional().or(z.literal("")),
});
export type CreateCourseAttachmentInput = z.infer<typeof createCourseAttachmentSchema>;

export const deleteCourseAttachmentSchema = z.object({ id: z.string().uuid() });
export type DeleteCourseAttachmentInput = z.infer<typeof deleteCourseAttachmentSchema>;
