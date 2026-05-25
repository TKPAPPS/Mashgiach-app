import { ToastProvider } from '@/components/ui/Toast'

export const metadata = {
  title: 'משגיח: מעקב כשרות',
}

export default function InspectorLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  )
}
