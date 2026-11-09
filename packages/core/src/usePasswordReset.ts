import { useState } from 'react'
import type { Key } from './i18n'
import { db, recoveryClient } from './supabase'
import { errMsg } from './useQuery'
import type { Recovery } from './useVerifyCode'

export type ResetStep = 'email' | 'code' | 'password'
export type ResetPhase = { state: 'idle' } | { state: 'busy' } | { state: 'error'; message: Key }

export type PasswordReset = {
  step: ResetStep
  email: string
  phase: ResetPhase
  recovery: Recovery
  send: (email: string) => Promise<void>
  save: (password: string) => Promise<void>
  changeEmail: () => void
}

// onChanged only runs if the password was saved but signing in with it failed; normally the auth listener takes over.
export const usePasswordReset = (onChanged: () => void): PasswordReset => {
  const [step, setStep] = useState<ResetStep>('email')
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<ResetPhase>({ state: 'idle' })
  const [client] = useState(recoveryClient)

  const send = async (to: string): Promise<void> => {
    setPhase({ state: 'busy' })
    const { error } = await db().auth.resetPasswordForEmail(to)
    if (error) return setPhase({ state: 'error', message: errMsg(error) })
    setEmail(to)
    setStep('code')
    setPhase({ state: 'idle' })
  }

  const save = async (password: string): Promise<void> => {
    setPhase({ state: 'busy' })
    const { error } = await client.auth.updateUser({ password })
    // They remembered the old password after all, so it's still the one they want to use.
    if (error && error.code !== 'same_password')
      return setPhase({ state: 'error', message: errMsg(error) })
    if ((await db().auth.signInWithPassword({ email, password })).error) onChanged()
  }

  return {
    step,
    email,
    phase,
    recovery: { client, onVerified: () => setStep('password') },
    send,
    save,
    changeEmail: () => {
      setStep('email')
      setPhase({ state: 'idle' })
    }
  }
}
