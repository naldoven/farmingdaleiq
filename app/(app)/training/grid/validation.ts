import { z } from "zod";

export const enrollTraineeSchema = z.object({
  userId: z.string().uuid(),
  roadmapId: z.string().uuid(),
});
export type EnrollTraineeInput = z.infer<typeof enrollTraineeSchema>;

export const cycleStationSchema = z.object({
  enrollmentId: z.string().uuid(),
  roadmapStationId: z.string().uuid(),
});
export type CycleStationInput = z.infer<typeof cycleStationSchema>;
