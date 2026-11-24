let client;
let account;
let revision;
let pending = Promise.resolve();
let conflict = false;

export async function connect() {
  const {url, publishableKey} = await fetch('./supabase-config.json', {cache:'no-store'}).then(response=>{
    if(!response.ok) throw new Error('A configuração do Supabase está indisponível.');
    return response.json();
  });
  const {createClient} = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm');
  client = createClient(url,publishableKey);
  const {data,error} = await client.auth.getSession();
  if(error) throw error;
  return data.session?.user;
}

export async function signIn(email,password) {
  const {data,error} = await client.auth.signInWithPassword({email,password});
  if(error) throw error;
  return data.user;
}

export async function signOut() {
  await pending;
  const {error} = await client.auth.signOut({scope:'local'});
  if(error) throw error;
}

export async function loadBoard(user) {
  const {data,error} = await client.from('pulso_boards').select('snapshot,revision').eq('owner_id',user.id).maybeSingle();
  if(error) throw error;
  account = user.id;
  revision = data?.revision;
  conflict = false;
  return data?.snapshot;
}

export function persistBoard(snapshot) {
  const operation = pending.then(async ()=>{
    if(conflict) throw new Error('O quadro mudou em outra sessão. Recarregue a página antes de continuar.');
    const table = client.from('pulso_boards');
    const result = revision === undefined
      ? await table.insert({owner_id:account,snapshot}).select('revision').single()
      : await table.update({snapshot,revision:revision+1}).eq('owner_id',account).eq('revision',revision).select('revision').maybeSingle();
    if(result.error?.code==='23505' || (!result.error && !result.data)){
      conflict = true;
      throw new Error('O quadro mudou em outra sessão. Recarregue a página antes de continuar.');
    }
    if(result.error) throw new Error('Não foi possível salvar no Supabase.');
    revision = result.data.revision;
  });
  pending = operation.catch(()=>{});
  return operation;
}
