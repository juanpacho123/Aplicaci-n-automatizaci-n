-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('ADMIN', 'CONTRACTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_APPROVAL', 'INVITATION_SENT', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('MEMBER', 'GUEST', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DataEnvironment" AS ENUM ('DEMO', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'INFO_REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('SENT', 'FAILED', 'REDEEMED');

-- CreateEnum
CREATE TYPE "FolderOperationType" AS ENUM ('CREATE', 'RENAME', 'DELETE');

-- CreateEnum
CREATE TYPE "OperationResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "UploadOperationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UploadFileStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConflictBehavior" AS ENUM ('FAIL', 'REPLACE', 'RENAME');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('ENTRA_ID', 'DEMO');

-- CreateTable
CREATE TABLE "roles" (
    "key" "RoleKey" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "contact_email" TEXT,
    "notes" TEXT,
    "sharepoint_folder_item_id" TEXT,
    "sharepoint_folder_path" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "company_id" UUID,
    "role_key" "RoleKey" NOT NULL DEFAULT 'CONTRACTOR',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "identity_type" "IdentityType" NOT NULL DEFAULT 'UNKNOWN',
    "entra_tenant_id" TEXT,
    "entra_object_id" TEXT,
    "identity_bound_at" TIMESTAMP(3),
    "authorized_by_id" UUID,
    "authorized_at" TIMESTAMP(3),
    "status_changed_at" TIMESTAMP(3),
    "status_changed_by_id" UUID,
    "status_reason" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "auth_method" "AuthMethod" NOT NULL,
    "msal_partition_key" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_caches" (
    "partition_key" TEXT NOT NULL,
    "user_id" UUID,
    "payload" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_caches_pkey" PRIMARY KEY ("partition_key")
);

-- CreateTable
CREATE TABLE "access_requests" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "requested_project" TEXT NOT NULL,
    "justification" TEXT,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "review_notes" TEXT,
    "info_requested_message" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "resulting_user_id" UUID,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "invited_email" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL,
    "redirect_url" TEXT NOT NULL,
    "send_message" BOOLEAN NOT NULL DEFAULT true,
    "graph_invitation_id" TEXT,
    "invited_user_object_id" TEXT,
    "invited_user_type" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemed_at" TIMESTAMP(3),

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_projects" (
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_projects_pkey" PRIMARY KEY ("user_id","project_id")
);

-- CreateTable
CREATE TABLE "project_locations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "company_id" UUID,
    "site_id" TEXT NOT NULL,
    "drive_id" TEXT NOT NULL,
    "root_item_id" TEXT NOT NULL,
    "root_name" TEXT NOT NULL,
    "root_path" TEXT NOT NULL,
    "web_url" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_stage_folders" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "stage_key" TEXT NOT NULL,
    "drive_item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_stage_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folder_operations" (
    "id" UUID NOT NULL,
    "type" "FolderOperationType" NOT NULL,
    "result" "OperationResult" NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "location_id" UUID,
    "stage_key" TEXT,
    "drive_id" TEXT NOT NULL,
    "parent_item_id" TEXT,
    "drive_item_id" TEXT,
    "name" TEXT NOT NULL,
    "previous_name" TEXT,
    "path" TEXT NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "environment" "DataEnvironment" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folder_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_operations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "stage_key" TEXT NOT NULL,
    "drive_id" TEXT NOT NULL,
    "folder_item_id" TEXT NOT NULL,
    "folder_path" TEXT NOT NULL,
    "status" "UploadOperationStatus" NOT NULL DEFAULT 'PENDING',
    "total_files" INTEGER NOT NULL,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "cancelled_count" INTEGER NOT NULL DEFAULT 0,
    "environment" "DataEnvironment" NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "upload_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "final_name" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "mime_type" TEXT,
    "size" BIGINT NOT NULL,
    "status" "UploadFileStatus" NOT NULL DEFAULT 'PENDING',
    "conflict_behavior" "ConflictBehavior" NOT NULL DEFAULT 'FAIL',
    "bytes_uploaded" BIGINT NOT NULL DEFAULT 0,
    "upload_session_enc" TEXT,
    "upload_session_expiry" TIMESTAMP(3),
    "drive_item_id" TEXT,
    "web_url" TEXT,
    "e_tag" TEXT,
    "verified_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "actor_email" TEXT,
    "actor_name" TEXT,
    "actor_company" TEXT,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "result" "AuditResult" NOT NULL,
    "project_id" UUID,
    "project_code" TEXT,
    "target_type" TEXT,
    "target_id" TEXT,
    "document_name" TEXT,
    "folder_path" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "details" JSONB,
    "environment" "DataEnvironment" NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "demo_drive_items" (
    "id" TEXT NOT NULL,
    "drive_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "name_lower" TEXT NOT NULL,
    "is_folder" BOOLEAN NOT NULL,
    "size" BIGINT NOT NULL DEFAULT 0,
    "mime_type" TEXT,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_drive_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_upload_sessions" (
    "id" TEXT NOT NULL,
    "drive_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "received" BIGINT NOT NULL DEFAULT 0,
    "replace" BOOLEAN NOT NULL DEFAULT false,
    "created_by_name" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_entra_tenant_id_entra_object_id_key" ON "users"("entra_tenant_id", "entra_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "token_caches_user_id_idx" ON "token_caches"("user_id");

-- CreateIndex
CREATE INDEX "access_requests_status_idx" ON "access_requests"("status");

-- CreateIndex
CREATE INDEX "access_requests_email_idx" ON "access_requests"("email");

-- CreateIndex
CREATE INDEX "invitations_user_id_idx" ON "invitations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "user_projects_project_id_idx" ON "user_projects"("project_id");

-- CreateIndex
CREATE INDEX "project_locations_project_id_idx" ON "project_locations"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_stage_folders_location_id_stage_key_key" ON "project_stage_folders"("location_id", "stage_key");

-- CreateIndex
CREATE INDEX "folder_operations_project_id_created_at_idx" ON "folder_operations"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "folder_operations_user_id_created_at_idx" ON "folder_operations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "folder_operations_drive_item_id_idx" ON "folder_operations"("drive_item_id");

-- CreateIndex
CREATE INDEX "upload_operations_user_id_created_at_idx" ON "upload_operations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "upload_operations_project_id_created_at_idx" ON "upload_operations"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "upload_operations_status_idx" ON "upload_operations"("status");

-- CreateIndex
CREATE INDEX "uploaded_files_operation_id_idx" ON "uploaded_files"("operation_id");

-- CreateIndex
CREATE INDEX "uploaded_files_status_idx" ON "uploaded_files"("status");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_occurred_at_idx" ON "audit_logs"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_category_occurred_at_idx" ON "audit_logs"("category", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_project_id_occurred_at_idx" ON "audit_logs"("project_id", "occurred_at");

-- CreateIndex
CREATE INDEX "demo_drive_items_drive_id_idx" ON "demo_drive_items"("drive_id");

-- CreateIndex
CREATE UNIQUE INDEX "demo_drive_items_parent_id_name_lower_key" ON "demo_drive_items"("parent_id", "name_lower");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_key_fkey" FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_authorized_by_id_fkey" FOREIGN KEY ("authorized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_projects" ADD CONSTRAINT "user_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_projects" ADD CONSTRAINT "user_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_projects" ADD CONSTRAINT "user_projects_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_locations" ADD CONSTRAINT "project_locations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_locations" ADD CONSTRAINT "project_locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_stage_folders" ADD CONSTRAINT "project_stage_folders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "project_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_operations" ADD CONSTRAINT "folder_operations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_operations" ADD CONSTRAINT "folder_operations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_operations" ADD CONSTRAINT "upload_operations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_operations" ADD CONSTRAINT "upload_operations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "upload_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Restricciones adicionales (no expresables en Prisma) ─────────────

-- El correo se almacena siempre normalizado en minúsculas y sin espacios.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_chk" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_email_lowercase_chk" CHECK ("email" = lower(btrim("email")));

-- Nombres de empresa únicos sin distinguir mayúsculas.
CREATE UNIQUE INDEX "companies_name_ci_key" ON "companies" (lower("name"));
-- Códigos de proyecto únicos sin distinguir mayúsculas.
CREATE UNIQUE INDEX "projects_code_ci_key" ON "projects" (lower("code"));

-- Una sola ubicación compartida (company_id NULL) por proyecto,
-- y una sola ubicación específica por (proyecto, empresa).
CREATE UNIQUE INDEX "project_locations_shared_key" ON "project_locations" ("project_id") WHERE "company_id" IS NULL;
CREATE UNIQUE INDEX "project_locations_company_key" ON "project_locations" ("project_id", "company_id") WHERE "company_id" IS NOT NULL;

-- Coherencia de contadores de operaciones de carga.
ALTER TABLE "upload_operations" ADD CONSTRAINT "upload_operations_counts_chk"
  CHECK ("total_files" > 0 AND "success_count" >= 0 AND "error_count" >= 0 AND "cancelled_count" >= 0
         AND "success_count" + "error_count" + "cancelled_count" <= "total_files");
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_size_chk" CHECK ("size" >= 0 AND "bytes_uploaded" >= 0 AND "bytes_uploaded" <= "size");

-- Auditoría inmutable: se prohíben UPDATE y DELETE.
-- La depuración por retención solo es posible desde el script de mantenimiento,
-- que activa explícitamente la variable de sesión app.audit_purge = 'on'.
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs es de solo inserción (operación % no permitida)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();

-- Datos de referencia obligatorios: roles del sistema (no son datos de demostración).
INSERT INTO "roles" ("key", "name", "description") VALUES
  ('ADMIN', 'Administrador', 'Control total sobre usuarios, permisos, proyectos, carpetas, operaciones y configuración.'),
  ('CONTRACTOR', 'Contratista', 'Consulta sus proyectos autorizados, carga documentos y crea subcarpetas en ubicaciones permitidas.'),
  ('VIEWER', 'Consulta', 'Consulta proyectos, carpetas y documentos autorizados. No puede cargar ni crear carpetas.');
