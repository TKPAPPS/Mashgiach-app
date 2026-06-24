'use client'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'
import { PERSIST_COOKIE_OPTIONS } from './cookieOptions'

function createDevMockClient() {
  // A properly thenable builder for all query chains
  function makeBuilder(resolvedValue: unknown = { data: [], error: null }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(resolvedValue).then(resolve, reject)
      },
      catch(reject: (e: unknown) => unknown) {
        return Promise.resolve(resolvedValue).catch(reject)
      },
      finally(cb: () => void) {
        return Promise.resolve(resolvedValue).finally(cb)
      },
    }
    // Every chaining method returns the same builder
    const chainMethods = [
      'select','insert','update','delete','upsert',
      'eq','neq','gt','gte','lt','lte','like','ilike',
      'in','not','is','or','and','filter','match',
      'order','limit','range','single','maybeSingle',
      'returns','throwOnError',
    ]
    chainMethods.forEach(m => { b[m] = () => b })

    // single() / maybeSingle() should resolve to { data: null, error: null }
    b.single     = () => makeBuilder({ data: null, error: null })
    b.maybeSingle = () => makeBuilder({ data: null, error: null })
    return b
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    auth: {
      getUser:              async () => ({ data: { user: null }, error: null }),
      getSession:           async () => ({ data: { session: null }, error: null }),
      signInWithPassword:   async () => ({ data: null, error: { message: 'DEV: no Supabase connected' } }),
      signOut:              async () => ({ error: null }),
      onAuthStateChange:    () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: (_table: string) => makeBuilder({ data: [], error: null }),
    storage: {
      from: () => ({
        upload:       async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        download:     async () => ({ data: null, error: null }),
        remove:       async () => ({ data: null, error: null }),
      }),
    },
  }
  return mock
}

export function createClient() {
  if (process.env.NEXT_PUBLIC_DEV_BYPASS === 'true') {
    return createDevMockClient() as unknown as ReturnType<typeof createBrowserClient<Database>>
  }
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: PERSIST_COOKIE_OPTIONS }
  )
}
