export interface VideoGenerationRequest {
  prompt: string;
  duration?: number;
  aspectRatio?: string;
}

export interface VideoGenerationResult {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string;
}

export async function createProductVideo(
  request: VideoGenerationRequest
): Promise<VideoGenerationResult> {

  /*
   * VIDEO PROVIDER WILL BE CONNECTED HERE.
   *
   * Keep this abstraction separate from ai.server.ts.
   */

  throw new Error(
    "VIDEO_PROVIDER_NOT_CONFIGURED"
  );
}