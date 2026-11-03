import { describe, expect, it } from "vitest";
import { GraphClient } from "@/lib/graph/client";
import { findDirectoryUserByEmail, sendB2BInvitation } from "@/lib/graph/directory";

function client(handler: (url: string, init: RequestInit) => { status: number; body?: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (u: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(u), init: init ?? {} });
    const r = handler(String(u), init ?? {});
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { graph: new GraphClient(async () => "ADMIN_TOKEN", "https://graph.microsoft.com/v1.0", impl, 0), calls };
}

describe("Invitaciones Microsoft Entra B2B", () => {
  it("envía POST /invitations con el correo, la URL de retorno y el mensaje", async () => {
    const { graph, calls } = client(() => ({ status: 201, body: { id: "inv-1", status: "PendingAcceptance", invitedUser: { id: "guest-oid" }, invitedUserType: "Guest" } }));
    const r = await sendB2BInvitation(graph, { email: "documentos@constructoraabc.example", displayName: "Carlos", redirectUrl: "https://portal.example/login", sendMessage: true, message: "Bienvenido" });
    expect(r).toEqual({ id: "inv-1", status: "PendingAcceptance", invitedUserId: "guest-oid", invitedUserType: "Guest" });
    expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/invitations");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      invitedUserEmailAddress: "documentos@constructoraabc.example",
      invitedUserDisplayName: "Carlos",
      inviteRedirectUrl: "https://portal.example/login",
      sendInvitationMessage: true,
      invitedUserType: "Guest",
      invitedUserMessageInfo: { customizedMessageBody: "Bienvenido", messageLanguage: "es-ES" },
    });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer ADMIN_TOKEN");
  });

  it("propaga la falta de permisos (403) sin ocultarla", async () => {
    const { graph } = client(() => ({ status: 403, body: { error: { code: "Authorization_RequestDenied" } } }));
    await expect(sendB2BInvitation(graph, { email: "a@b.example", displayName: "A", redirectUrl: "x", sendMessage: false, message: "" })).rejects.toMatchObject({ status: 403 });
  });

  it("busca usuarios del directorio por UPN y, si no existe, por mail/otherMails", async () => {
    const { graph, calls } = client((url) => (url.includes("/users/") ? { status: 404, body: { error: { code: "Request_ResourceNotFound" } } } : { status: 200, body: { value: [{ id: "oid-1", displayName: "X", mail: "x@y.example", userPrincipalName: "x_y#EXT#@t", userType: "Guest" }] } }));
    const u = await findDirectoryUserByEmail(graph, "x@y.example");
    expect(u?.id).toBe("oid-1");
    expect(decodeURIComponent(calls[1].url)).toContain("mail eq 'x@y.example' or otherMails/any(m:m eq 'x@y.example')");
    expect((calls[1].init.headers as Record<string, string>).ConsistencyLevel).toBe("eventual");
  });

  it("escapa comillas en el filtro OData", async () => {
    const { graph, calls } = client((url) => (url.includes("/users/") ? { status: 404 } : { status: 200, body: { value: [] } }));
    await findDirectoryUserByEmail(graph, "o'brien@x.example");
    expect(decodeURIComponent(calls[1].url)).toContain("mail eq 'o''brien@x.example'");
  });
});
