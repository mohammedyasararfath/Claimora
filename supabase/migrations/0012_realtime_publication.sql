-- The client hooks (useLiveQueue, useChatSessionMessages) subscribe to
-- postgres_changes on these two tables, but a table only broadcasts changes
-- once it's explicitly added to the supabase_realtime publication — that
-- step was missing, so the staff-facing agent console has silently never
-- received a live update in production: new visitor/agent messages and
-- queue status changes only ever appeared after a manual page reload.
-- REPLICA IDENTITY FULL ensures UPDATE/DELETE payloads carry full old-row
-- data, which useLiveQueue's DELETE handler and future UPDATE diffing rely on.
alter table chat_messages replica identity full;
alter table live_agent_requests replica identity full;

alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table live_agent_requests;
