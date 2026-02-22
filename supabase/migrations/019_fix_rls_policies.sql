-- Fix CRITICAL: RLS policies using (true) allow all access
-- Add user_id columns and proper ownership-based RLS

-- 1. Add user_id to analyses and opportunities
alter table analyses add column if not exists user_id uuid references auth.users(id);
alter table opportunities add column if not exists user_id uuid references auth.users(id);

-- 2. Drop the permissive policies
drop policy if exists "owner_all" on analyses;
drop policy if exists "owner_all" on analysis_sections;
drop policy if exists "owner_all" on opportunities;

-- 3. Create proper ownership-based policies for analyses
create policy "analyses_select_own"
  on analyses for select
  using (auth.uid() = user_id);

create policy "analyses_insert_own"
  on analyses for insert
  with check (auth.uid() = user_id);

create policy "analyses_update_own"
  on analyses for update
  using (auth.uid() = user_id);

create policy "analyses_delete_own"
  on analyses for delete
  using (auth.uid() = user_id);

-- 4. Create proper policies for analysis_sections (via analysis ownership)
create policy "sections_select_own"
  on analysis_sections for select
  using (
    exists (
      select 1 from analyses
      where analyses.id = analysis_sections.analysis_id
        and analyses.user_id = auth.uid()
    )
  );

create policy "sections_insert_own"
  on analysis_sections for insert
  with check (
    exists (
      select 1 from analyses
      where analyses.id = analysis_sections.analysis_id
        and analyses.user_id = auth.uid()
    )
  );

create policy "sections_update_own"
  on analysis_sections for update
  using (
    exists (
      select 1 from analyses
      where analyses.id = analysis_sections.analysis_id
        and analyses.user_id = auth.uid()
    )
  );

create policy "sections_delete_own"
  on analysis_sections for delete
  using (
    exists (
      select 1 from analyses
      where analyses.id = analysis_sections.analysis_id
        and analyses.user_id = auth.uid()
    )
  );

-- 5. Create proper policies for opportunities
create policy "opportunities_select_own"
  on opportunities for select
  using (auth.uid() = user_id);

create policy "opportunities_insert_own"
  on opportunities for insert
  with check (auth.uid() = user_id);

create policy "opportunities_update_own"
  on opportunities for update
  using (auth.uid() = user_id);

create policy "opportunities_delete_own"
  on opportunities for delete
  using (auth.uid() = user_id);

-- 6. Allow service role to bypass RLS (for scraper service inserts)
-- This is automatic with service_role key, but explicit for clarity:
create policy "service_role_all_analyses"
  on analyses for all
  using (auth.role() = 'service_role');

create policy "service_role_all_sections"
  on analysis_sections for all
  using (auth.role() = 'service_role');

create policy "service_role_all_opportunities"
  on opportunities for all
  using (auth.role() = 'service_role');
