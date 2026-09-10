import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('authorization_required');
    const { requestId } = await request.json();
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) throw new Error('function_environment_missing');

    // The caller JWT reaches arm_wamda, where the database enforces admin_profiles.
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: armed, error: armError } = await caller.rpc('arm_wamda', { p_request_id: requestId });
    if (armError) throw armError;

    const delay = Math.max(0, new Date(armed.triggerAt).getTime() - Date.now());
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Service role stays only inside the function and is needed solely to fire a due signal.
    const service = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: fired, error: fireError } = await service.rpc('fire_wamda_signal', { p_signal_id: armed.signalId });
    if (fireError) throw fireError;
    return new Response(JSON.stringify({ fired }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'wamda_signal_failed';
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
