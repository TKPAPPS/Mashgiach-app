import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: prof } = await service.from('profiles').select('contract_url').eq('id', user.id).single()
  if (!prof?.contract_url) return NextResponse.json({ error: 'No contract' }, { status: 404 })

  const path = extractStoragePath(prof.contract_url)
  if (!path) return NextResponse.json({ error: 'Invalid contract path' }, { status: 400 })

  const { data: signed, error } = await service.storage.from('contracts').createSignedUrl(path, 3600)
  if (error || !signed) return NextResponse.json({ error: 'Could not generate signed URL' }, { status: 500 })

  return NextResponse.json({ url: signed.signedUrl })
}

function extractStoragePath(value: string): string | null {
  if (!value.startsWith('http')) return value
  const match = value.match(/\/storage\/v1\/object\/public\/contracts\/(.+)/)
  if (match) return match[1]
  return null
}
