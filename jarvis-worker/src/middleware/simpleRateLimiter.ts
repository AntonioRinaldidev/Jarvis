
const rateLimitMap = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalRequests: number;
}

export function RateLimiter(request:Request,pathname:string){
        const clientIP = extractClientIP(request);
      const rateLimitConfig = getRateLimitForEndpoint(pathname);
      
      const rateLimitResult = simpleRateLimit(
        clientIP, 
        rateLimitConfig.maxRequests, 
        rateLimitConfig.windowMs
      );
      return {rateLimitResult,rateLimitConfig,clientIP};
}

function simpleRateLimit(
  ip: string, 
  maxRequests: number = 3, 
  windowMs: number = 60000 
): RateLimitResult {
  
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = ip;
  
  // Ottieni richieste esistenti per questo IP
  const requests = rateLimitMap.get(key) || [];
  
  // Filtra solo richieste nella finestra corrente
  const recentRequests = requests.filter(timestamp => timestamp > windowStart);
  
  if (recentRequests.length >= maxRequests) {
    // Rate limited
    return {
      allowed: false,
      remaining: 0,
      resetTime: Math.max(...recentRequests) + windowMs,
      totalRequests: recentRequests.length
    };
  }
  
  // Aggiungi questa richiesta
  recentRequests.push(now);
  rateLimitMap.set(key, recentRequests);
  
  // Cleanup periodico (1% delle volte per performance)
  if (Math.random() < 0.01) {
    cleanupOldEntries(windowMs);
  }
  
  return {
    allowed: true,
    remaining: maxRequests - recentRequests.length,
    resetTime: now + windowMs,
    totalRequests: recentRequests.length
  };
}

// Cleanup per evitare memory leaks
function cleanupOldEntries(windowMs: number) {
  const now = Date.now();
  const cutoff = now - windowMs * 2; // Tieni un po' di buffer
  
  for (const [key, requests] of rateLimitMap.entries()) {
    const recent = requests.filter(timestamp => timestamp > cutoff);
    if (recent.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, recent);
    }
  }
}

// Utility per estrarre IP
export function extractClientIP(request: Request): string {
  const xForwardedFor = request.headers.get('X-Forwarded-For');
  const xRealIP = request.headers.get('X-Real-IP');
  const cfConnectingIP = request.headers.get('CF-Connecting-IP');
  
  // Priorità: X-Forwarded-For (primo IP) > X-Real-IP > CF-Connecting-IP
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  
  return xRealIP || cfConnectingIP || 'unknown';
}

// Rate limits per endpoint diversi
export const RATE_LIMITS = {
  '/chat': { maxRequests: 2, windowMs: 60000 },        // 2 chat/minuto
  '/upload-document': { maxRequests: 1, windowMs: 60000 }, // 1 upload/minuto
  '/test-vectorize': { maxRequests: 1, windowMs: 60000 },  // 1 test/minuto
  '/status': { maxRequests: 10, windowMs: 60000 },     // 10 status/minuto
  'default': { maxRequests: 3, windowMs: 60000 }       // 3 richieste/minuto default
};

export function getRateLimitForEndpoint(pathname: string) {
  return RATE_LIMITS[pathname as keyof typeof RATE_LIMITS] || RATE_LIMITS.default;
}