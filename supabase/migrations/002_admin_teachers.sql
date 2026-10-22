-- 관리자 선생님이 다른 선생님 계정을 발급할 수 있도록
alter table public.profiles add column is_admin boolean not null default false;
alter table public.profiles add column created_by uuid references public.profiles(id) on delete set null;

-- 지금까지의 선생님(첫 선생님 계정)을 관리자로 지정
update public.profiles set is_admin = true where role = 'teacher';

-- 관리자는 자기가 발급한 선생님 계정을 조회할 수 있다
drop policy "profiles_select_own_or_teacher" on public.profiles;
create policy "profiles_select_own_or_teacher" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or teacher_id = (select auth.uid())
    or (role = 'teacher' and created_by = (select auth.uid()))
  );
create index profiles_created_by_idx on public.profiles(created_by);
