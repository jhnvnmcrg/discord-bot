import { ClerkProvider } from '@clerk/tanstack-react-start'

// Clerk's widgets render outside Tailwind and derive shades from these
// values, so the Blurple palette is repeated here as literals.
const appearance = {
  variables: {
    colorPrimary: '#5865f2',
    colorPrimaryForeground: '#ffffff',
    colorBackground: '#2b2d31',
    colorForeground: '#dbdee1',
    colorMutedForeground: '#949ba4',
    colorMuted: '#313338',
    colorInput: '#1e1f22',
    colorInputForeground: '#dbdee1',
    colorNeutral: '#dbdee1',
    colorDanger: '#f23f43',
    colorSuccess: '#23a55a',
    borderRadius: '0.5rem',
    fontFamily: "'Figtree', ui-sans-serif, system-ui, sans-serif",
  },
}

export default function AppClerkProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return <ClerkProvider appearance={appearance}>{children}</ClerkProvider>
}
