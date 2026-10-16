import { applyDecorators, Injectable } from "@nestjs/common";
import type { PipeTransform } from "@nestjs/common";
import { ApiBody, ApiQuery, ApiResponse } from "@nestjs/swagger";
import { z } from "zod";
import { AppError } from "./app-error";

/**
 * Zod is the single source of truth for request and response shapes:
 * it validates input at runtime, gives TypeScript types via z.infer, and
 * feeds the OpenAPI document that the web client is generated from.
 */

/** Schemas that appear in the OpenAPI document under components.schemas. */
export const apiSchemas = z.registry<{ id: string; description?: string }>();

/** Registers a schema as a named OpenAPI component and returns it unchanged. */
export function named<T extends z.ZodType>(id: string, schema: T, description?: string): T {
  apiSchemas.add(schema, { id, description });
  return schema;
}

function ref(schema: z.ZodType) {
  const meta = apiSchemas.get(schema);
  if (!meta) {
    throw new Error("Schemas used in API docs must be registered with named()");
  }
  return { $ref: `#/components/schemas/${meta.id}` };
}

/** All named schemas as OpenAPI 3.0 components. */
export function openApiComponents(): Record<string, object> {
  const { schemas } = z.toJSONSchema(apiSchemas, {
    target: "openapi-3.0",
    // Describe what clients send and receive, before any server-side transforms.
    io: "input",
    unrepresentable: "any",
    uri: (id) => `#/components/schemas/${id}`,
  });
  for (const s of Object.values(schemas)) delete (s as { $id?: string }).$id;
  return schemas;
}

/** Validates and parses a request part. Failures become a 422 problem response. */
@Injectable()
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw new AppError(422, "validation_failed", "Some fields are not valid.", {
      errors: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
}

export const zod = <T extends z.ZodType>(schema: T) => new ZodPipe(schema);

/** Documents a JSON request body. Pair with `@Body(zod(Schema))`. */
export const ApiZodBody = (schema: z.ZodType) => ApiBody({ schema: ref(schema) });

/** Documents a response body for a status code. */
export const ApiZodResponse = (status: number, schema: z.ZodType, description = "OK") =>
  ApiResponse({ status, description, schema: ref(schema) });

/** Documents each field of a query schema. Pair with `@Query(zod(Schema))`. */
export function ApiZodQuery(schema: z.ZodObject) {
  return applyDecorators(
    ...Object.entries(schema.shape).map(([name, field]) => {
      const f = field as z.ZodType;
      return ApiQuery({
        name,
        required: !f.safeParse(undefined).success,
        schema: z.toJSONSchema(f, { target: "openapi-3.0", io: "input" }) as object,
      });
    }),
  );
}
