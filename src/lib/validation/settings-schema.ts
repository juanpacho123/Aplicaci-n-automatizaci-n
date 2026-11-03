import { z } from "zod";

/**
 * Esquema de la configuración administrativa. Valores no sensibles; los secretos
 * permanecen en variables de entorno del servidor.
 */

export const StageDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{1,30}$/, "Clave de etapa no válida"),
  label: z.string().trim().min(1).max(60),
  order: z.number().int().min(1).max(20),
  /** Nombres de carpeta aceptados en SharePoint para esta etapa (p. ej. "1. Inicio"). */
  folderNames: z.array(z.string().trim().min(1).max(120)).min(1).max(10),
  /** Subcarpetas iniciales esperadas (se verifican; nunca se crean automáticamente). */
  expectedSubfolders: z.array(z.string().trim().min(1).max(120)).max(40),
});
export type StageDefinition = z.infer<typeof StageDefinitionSchema>;

export const SettingsSchema = z.object({
  branding: z.object({
    portalName: z.string().trim().min(3).max(80),
    subtitle: z.string().trim().max(140),
    organizationName: z.string().trim().max(120),
    supportEmail: z.union([z.string().trim().email(), z.literal("")]),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal #RRGGBB"),
  }),
  uploads: z.object({
    maxFileSizeMB: z.number().int().min(1).max(250 * 1024),
    maxFilesPerOperation: z.number().int().min(1).max(200),
    allowedExtensions: z
      .array(z.string().trim().toLowerCase().regex(/^[a-z0-9]{1,10}$/, "Extensión sin punto, solo letras y números"))
      .min(1)
      .max(100),
    /** Fragmento de carga en KiB; Graph exige múltiplos de 320 KiB. */
    chunkSizeKB: z
      .number()
      .int()
      .min(320)
      .max(60 * 1024)
      .refine((v) => v % 320 === 0, "Debe ser múltiplo de 320 KiB (requisito de Microsoft Graph)"),
    /** Por debajo de este tamaño se usa carga simple; por encima, sesión de carga. */
    simpleUploadMaxMB: z.number().min(0).max(4),
    maxRetries: z.number().int().min(0).max(10),
    parallelUploads: z.number().int().min(1).max(6),
    allowContractorReplace: z.boolean(),
  }),
  structure: z.object({
    stages: z.array(StageDefinitionSchema).min(1).max(10),
    contractorsCanCreateAtStageRoot: z.boolean(),
    maxFolderDepth: z.number().int().min(1).max(30),
  }),
  auth: z.object({
    sessionIdleMinutes: z.number().int().min(5).max(24 * 60),
    sessionAbsoluteHours: z.number().int().min(1).max(7 * 24),
    allowFirstLoginEmailBinding: z.boolean(),
    sendInvitationEmail: z.boolean(),
    invitationMessage: z.string().max(1000),
  }),
  audit: z.object({
    captureIp: z.boolean(),
    captureUserAgent: z.boolean(),
    retentionDays: z.number().int().min(30).max(3650),
  }),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsSection = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  branding: {
    portalName: "Portal de Gestión Documental",
    subtitle: "Gestión centralizada de documentación de contratistas y proyectos.",
    organizationName: "",
    supportEmail: "",
    accentColor: "#123B6D",
  },
  uploads: {
    maxFileSizeMB: 250,
    maxFilesPerOperation: 50,
    allowedExtensions: [
      "pdf", "doc", "docx", "xls", "xlsx", "xlsm", "ppt", "pptx", "csv", "txt",
      "jpg", "jpeg", "png", "tif", "tiff", "dwg", "dxf", "zip", "msg", "eml",
    ],
    chunkSizeKB: 320 * 16, // 5 MiB
    simpleUploadMaxMB: 4,
    maxRetries: 3,
    parallelUploads: 3,
    allowContractorReplace: false,
  },
  structure: {
    stages: [
      { key: "inicio", label: "Inicio", order: 1, folderNames: ["1. Inicio", "1 Inicio", "01. Inicio", "Inicio"], expectedSubfolders: [] },
      {
        key: "ejecucion",
        label: "Ejecución",
        order: 2,
        folderNames: ["2. Ejecución", "2. Ejecucion", "2 Ejecución", "02. Ejecución", "Ejecución", "Ejecucion"],
        expectedSubfolders: [
          "2.01 Documentación contratista",
          "2.02 Reunión antes de la construcción",
          "2.03 Simulacro",
          "2.04 Compras",
          "2.05 Materiales, equipo y estudio",
          "2.06 Seguimiento",
          "2.07 Planos",
          "2.08 Plan de calidad",
        ],
      },
      { key: "cierre", label: "Cierre", order: 3, folderNames: ["3. Cierre", "3 Cierre", "03. Cierre", "Cierre"], expectedSubfolders: ["Dossier", "Entrenamiento del personal"] },
    ],
    contractorsCanCreateAtStageRoot: true,
    maxFolderDepth: 12,
  },
  auth: {
    sessionIdleMinutes: 60,
    sessionAbsoluteHours: 12,
    allowFirstLoginEmailBinding: true,
    sendInvitationEmail: true,
    invitationMessage: "Ha sido autorizado para acceder al Portal de Gestión Documental. Acepte esta invitación para verificar su identidad.",
  },
  audit: { captureIp: true, captureUserAgent: true, retentionDays: 1825 },
};
