/**
 * Publish processor.
 *
 * Handles the work that cannot run inside a request: scheduled posts, and
 * video, where Instagram takes roughly ninety seconds to transcode a Reel
 * before it can be published.
 */

import type { Job } from 'bullmq';
import { publishPost } from '../../modules/posts/publisher.js';

export interface PublishJobData {
  postId: string;
  organizationId: string;
}

export async function processPublishJob(job: Job<PublishJobData>): Promise<void> {
  await publishPost(job.data.postId, job.data.organizationId);
}
