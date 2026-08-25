import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
 
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
 
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )
 
  // IMPORTANT: always use getUser(), never getSession(), here.
  // getUser() validates the JWT against Supabase's servers;
  // getSession() just reads the cookie, which can be spoofed.
  await supabase.auth.getUser()
 
  return supabaseResponse
}
 
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - image files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}