import { NextResponse, type NextRequest } from 'next/server'

// Middleware simplificado — protecção feita no lado do cliente por agora
export async function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: []
}
