import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function App() {
  const [status, setStatus] = useState('checking...')

  useEffect(() => {
    supabase.auth.getSession().then(({ error }) => {
      setStatus(error ? `error: ${error.message}` : 'connected')
    })
  }, [])

  return (
    <div className="min-h-screen grid place-items-center bg-[#FCFBFF]">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-[#211A2C]">
          Wealth Intelligence
        </h1>
        <p className="mt-2 text-sm text-[#6C6578]">Supabase: {status}</p>
      </div>
    </div>
  )
}
