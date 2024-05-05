import * as z from "nestjs-zod/z"
import { createZodDto } from "nestjs-zod/dto"

export const PostModel = z.object({
  id: z.number().int(),
  title: z.string(),
  content: z.string(),
  published: z.number().int(),
  authorId: z.number().int(),
  author: z.string().nullish(),
})

export class PostDto extends createZodDto(PostModel) {
}