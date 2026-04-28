// Declaration stubs for optional runtime dependencies
// These packages are not required in all environments (dev/test vs production)

declare module 'rate-limit-redis' {
  const value: any;
  export default value;
}

declare module 'ioredis' {
  export class Redis {
    constructor(url: string, options?: any);
    on(event: string, callback: (...args: any[]) => void): void;
  }
  export default Redis;
}
