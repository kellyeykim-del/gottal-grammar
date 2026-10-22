// 계정 관리 Edge Function (service role 사용)
//  - status          : 선생님 계정이 이미 있는지
//  - setup_teacher   : 첫 선생님 계정 만들기 (선생님이 하나도 없을 때만)
//  - create_student  : 학생 계정 발급 (선생님만)
//  - reset_password  : 학생 비밀번호 재설정 (담당 선생님만)
//  - delete_student  : 학생 계정 삭제 (담당 선생님만)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const EMAIL_DOMAIN = "students.gottal-grammar.app";
const LOGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{2,19}$/;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (message: string, status = 400) => json({ error: message }, status);

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const emailOf = (loginId: string) => `${loginId}@${EMAIL_DOMAIN}`;

function checkCredentials(loginId: unknown, password: unknown, name: unknown) {
  if (typeof loginId !== "string" || !LOGIN_ID_RE.test(loginId)) {
    return "아이디는 영어 소문자·숫자로 3~20자여야 해요 (. _ - 사용 가능).";
  }
  if (typeof password !== "string" || password.length < 6 || password.length > 72) {
    return "비밀번호는 6자 이상이어야 해요.";
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim() || name.trim().length > 30)) {
    return "이름을 1~30자로 입력해 주세요.";
  }
  return null;
}

async function hasTeacher() {
  const { count, error } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher");
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function createUser(loginId: string, password: string, name: string, role: "teacher" | "student", teacherId: string | null) {
  const { data: exists } = await admin.from("profiles").select("id").eq("login_id", loginId).maybeSingle();
  if (exists) return { error: "이미 사용 중인 아이디예요." };
  const { data, error } = await admin.auth.admin.createUser({
    email: emailOf(loginId),
    password,
    email_confirm: true,
    user_metadata: { login_id: loginId, display_name: name },
  });
  if (error || !data.user) return { error: error?.message?.includes("already") ? "이미 사용 중인 아이디예요." : (error?.message ?? "계정을 만들지 못했어요.") };
  const { error: pErr } = await admin.from("profiles").insert({
    id: data.user.id, role, login_id: loginId, display_name: name, teacher_id: teacherId,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "프로필을 저장하지 못했어요." };
  }
  return { user: { id: data.user.id, login_id: loginId, display_name: name, role } };
}

async function callerProfile(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return null;
  const { data: profile } = await admin.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  return profile;
}

async function myStudent(teacherId: string, studentId: unknown) {
  if (typeof studentId !== "string") return null;
  const { data } = await admin.from("profiles").select("*").eq("id", studentId).eq("teacher_id", teacherId).eq("role", "student").maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("잘못된 요청이에요."); }

  try {
    switch (body.action) {
      case "status":
        return json({ hasTeacher: await hasTeacher() });

      case "setup_teacher": {
        if (await hasTeacher()) return fail("선생님 계정이 이미 있어요. 로그인해 주세요.", 403);
        const loginId = String(body.login_id ?? "").trim().toLowerCase();
        const err = checkCredentials(loginId, body.password, body.display_name);
        if (err) return fail(err);
        const r = await createUser(loginId, body.password as string, String(body.display_name).trim(), "teacher", null);
        return r.error ? fail(r.error) : json(r);
      }

      case "create_student": {
        const me = await callerProfile(req);
        if (!me || me.role !== "teacher") return fail("선생님만 할 수 있어요.", 403);
        const loginId = String(body.login_id ?? "").trim().toLowerCase();
        const err = checkCredentials(loginId, body.password, body.display_name);
        if (err) return fail(err);
        const r = await createUser(loginId, body.password as string, String(body.display_name).trim(), "student", me.id);
        return r.error ? fail(r.error) : json(r);
      }

      case "reset_password": {
        const me = await callerProfile(req);
        if (!me || me.role !== "teacher") return fail("선생님만 할 수 있어요.", 403);
        const student = await myStudent(me.id, body.user_id);
        if (!student) return fail("학생을 찾을 수 없어요.", 404);
        const err = checkCredentials(student.login_id, body.password, undefined);
        if (err) return fail(err);
        const { error } = await admin.auth.admin.updateUserById(student.id, { password: body.password as string });
        return error ? fail(error.message) : json({ ok: true });
      }

      case "delete_student": {
        const me = await callerProfile(req);
        if (!me || me.role !== "teacher") return fail("선생님만 할 수 있어요.", 403);
        const student = await myStudent(me.id, body.user_id);
        if (!student) return fail("학생을 찾을 수 없어요.", 404);
        const { error } = await admin.auth.admin.deleteUser(student.id); // profiles/state/attempts는 cascade 삭제
        return error ? fail(error.message) : json({ ok: true });
      }

      default:
        return fail("알 수 없는 요청이에요.");
    }
  } catch (e) {
    console.error(e);
    return fail("서버 오류가 발생했어요.", 500);
  }
});
