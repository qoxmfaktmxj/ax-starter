import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  date,
  bigint,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  parentId: uuid("parent_id"),
  rowVersion: integer("row_version").notNull().default(1),
});

export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    employeeId: uuid("employee_id"),
    orgId: uuid("org_id").references(() => organizations.id),
    active: integer("active").notNull().default(1),
    roleCode: varchar("role_code", { length: 30 }).notNull(),
    dataScope: varchar("data_scope", { length: 20 }).notNull(),
    authzVersion: integer("authz_version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("app_users_identity_key").on(table.issuer, table.subject),
  ],
);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeNo: varchar("employee_no", { length: 20 }).notNull().unique(),
    name: varchar("name", { length: 80 }).notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    position: varchar("position", { length: 50 }).notNull().default(""),
    hireDate: date("hire_date").notNull(),
    status: varchar("status", { length: 10 }).notNull().default("ACTIVE"),
    email: varchar("email", { length: 254 }).notNull().default(""),
    monthlySalary: numeric("monthly_salary", { precision: 18, scale: 2 }),
    rowVersion: integer("row_version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("employees_org_status_id_idx").on(
      table.orgId,
      table.status,
      table.id,
    ),
  ],
);

export const commandResults = pgTable(
  "command_results",
  {
    actorId: uuid("actor_id")
      .notNull()
      .references(() => appUsers.id),
    operation: varchar("operation", { length: 40 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    authzVersion: integer("authz_version").notNull(),
    httpStatus: integer("http_status").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.actorId, table.operation, table.idempotencyKey],
    }),
  ],
);

export const fileObjects = pgTable(
  "file_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerKind: varchar("owner_kind", { length: 20 }).notNull(),
    ownerId: uuid("owner_id").notNull(),
    originalName: text("original_name").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    contentType: varchar("content_type", { length: 80 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    backendId: varchar("backend_id", { length: 20 }).notNull(),
    objectKey: varchar("object_key", { length: 100 }).notNull().unique(),
    state: varchar("state", { length: 20 }).notNull(),
    scanStatus: varchar("scan_status", { length: 20 }).notNull(),
    rowVersion: integer("row_version").notNull().default(1),
    waiverBy: text("waiver_by"),
    waiverReason: text("waiver_reason"),
    waiverExpiresAt: timestamp("waiver_expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("file_objects_owner_idx").on(table.ownerKind, table.ownerId),
  ],
);

export const exportJobs = pgTable(
  "export_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => appUsers.id),
    idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    format: varchar("format", { length: 10 }).notNull(),
    request: jsonb("request").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    artifactId: uuid("artifact_id").references(() => fileObjects.id),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }),
    authzVersion: integer("authz_version").notNull(),
    subjectIds: jsonb("subject_ids").$type<string[]>(),
    projectionVersion: integer("projection_version"),
    errorCode: varchar("error_code", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("export_jobs_actor_key").on(
      table.actorId,
      table.idempotencyKey,
    ),
  ],
);

export const exportJobItems = pgTable(
  "export_job_items",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => exportJobs.id),
    ordinal: integer("ordinal").notNull(),
    employeeId: uuid("employee_id").notNull(),
    projectedJson: jsonb("projected_json").notNull(),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.ordinal] })],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    correlationId: uuid("correlation_id").notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    outcome: varchar("outcome", { length: 20 }).notNull(),
    subjectIds: jsonb("subject_ids").$type<string[]>(),
    source: varchar("source", { length: 30 }).notNull(),
    client: text("client"),
    changedFields: jsonb("changed_fields").$type<string[]>(),
  },
  (table) => [index("audit_events_time_idx").on(table.occurredAt)],
);
