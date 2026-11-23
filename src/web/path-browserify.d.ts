declare module 'path-browserify' {
    import { posix } from 'path';
    const pathBrowserify: typeof posix;
    export = pathBrowserify;
}
