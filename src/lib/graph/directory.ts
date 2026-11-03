import "server-only";
import { GraphClient, GraphError, enc } from "./client";

/**
 * Operaciones de directorio de Microsoft Entra ID con token DELEGADO del administrador.
 * Permisos: User.Invite.All (invitaciones B2B) y User.ReadBasic.All (búsqueda de usuarios).
 */

export type InvitationResult = {
  id: string;
  status: string;
  invitedUserId: string | null;
  invitedUserType: string | null;
};

export async function sendB2BInvitation(
  graph: GraphClient,
  input: { email: string; displayName: string; redirectUrl: string; sendMessage: boolean; message: string },
): Promise<InvitationResult> {
  const { data } = await graph.request<{ id: string; status: string; invitedUser?: { id?: string }; invitedUserType?: string }>("/invitations", {
    method: "POST",
    body: {
      invitedUserEmailAddress: input.email,
      invitedUserDisplayName: input.displayName,
      inviteRedirectUrl: input.redirectUrl,
      sendInvitationMessage: input.sendMessage,
      invitedUserType: "Guest",
      invitedUserMessageInfo: input.message ? { customizedMessageBody: input.message, messageLanguage: "es-ES" } : undefined,
    },
  });
  return { id: data.id, status: data.status, invitedUserId: data.invitedUser?.id ?? null, invitedUserType: data.invitedUserType ?? null };
}

export type DirectoryUser = { id: string; displayName: string; mail: string | null; userPrincipalName: string; userType: string | null };

/** Busca una cuenta del directorio por correo (UPN o mail), sin crear nada. */
export async function findDirectoryUserByEmail(graph: GraphClient, email: string): Promise<DirectoryUser | null> {
  const safe = email.replace(/'/g, "''");
  try {
    const direct = await graph.get<DirectoryUser>(`/users/${enc(email)}?$select=id,displayName,mail,userPrincipalName,userType`);
    if (direct?.id) return direct;
  } catch (err) {
    if (!(err instanceof GraphError) || err.graphStatus !== 404) throw err;
  }
  const res = await graph.get<{ value: DirectoryUser[] }>(
    `/users?$select=id,displayName,mail,userPrincipalName,userType&$filter=${encodeURIComponent(`mail eq '${safe}' or otherMails/any(m:m eq '${safe}')`)}&$count=true`,
    { headers: { ConsistencyLevel: "eventual" } },
  );
  return res.value.length === 1 ? res.value[0] : null;
}
