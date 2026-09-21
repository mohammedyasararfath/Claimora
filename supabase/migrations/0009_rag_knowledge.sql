create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'general_kb',
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

-- HNSW index requires at least one row to build against in some Postgres/pgvector
-- combinations when created eagerly; safe to create empty, it just starts small.
create index knowledge_chunks_embedding_idx on knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

create or replace function match_knowledge_chunks(query_embedding vector(1536), match_count int default 5)
returns table (id uuid, content text, similarity float)
language sql
stable
as $$
  select id, content, 1 - (embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

alter table knowledge_chunks enable row level security;
