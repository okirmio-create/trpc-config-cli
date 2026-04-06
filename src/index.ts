import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

// ─── Helpers ────────────────────────────────────────────────────────────────

function printFile(filename: string, content: string) {
  console.log(chalk.cyan(`\n// ─── ${filename} ${'─'.repeat(Math.max(0, 60 - filename.length))}`));
  console.log(content.trim());
}

function success(msg: string) {
  console.log(chalk.green('✔') + ' ' + msg);
}

function info(msg: string) {
  console.log(chalk.blue('ℹ') + ' ' + msg);
}

// ─── Templates ──────────────────────────────────────────────────────────────

function trpcInitTemplate(opts: {
  adapter: string;
  superjson: boolean;
  errorFormatter: boolean;
}): string {
  const imports: string[] = ['import { initTRPC } from \'@trpc/server\';'];

  if (opts.superjson) imports.push("import superjson from 'superjson';");
  if (opts.adapter === 'express') imports.push("import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';");
  if (opts.adapter === 'fastify') imports.push("import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';");
  if (opts.adapter === 'next') imports.push("import type { CreateNextContextOptions } from '@trpc/server/adapters/next';");

  imports.push("import type { Context } from './context';");

  const tInit: string[] = ['initTRPC.context<Context>().create({'];
  if (opts.superjson) tInit.push('  transformer: superjson,');
  if (opts.errorFormatter) {
    tInit.push('  errorFormatter({ shape, error }) {');
    tInit.push('    return {');
    tInit.push('      ...shape,');
    tInit.push('      data: {');
    tInit.push('        ...shape.data,');
    tInit.push('        zodError: error.cause instanceof Error ? error.cause.message : null,');
    tInit.push('      },');
    tInit.push('    };');
    tInit.push('  },');
  }
  tInit.push('})');

  return `${imports.join('\n')}

const t = ${tInit.join('\n')};

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;
`;
}

function contextTemplate(adapter: string): string {
  if (adapter === 'express') {
    return `import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

export async function createContext({ req, res }: CreateExpressContextOptions) {
  return { req, res };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
`;
  }
  if (adapter === 'fastify') {
    return `import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  return { req, res };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
`;
  }
  if (adapter === 'next') {
    return `import type { CreateNextContextOptions } from '@trpc/server/adapters/next';

export async function createContext({ req, res }: CreateNextContextOptions) {
  return { req, res };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
`;
  }
  // standalone
  return `import type { NodeHTTPCreateContextFnOptions } from '@trpc/server/adapters/node-http';
import type { IncomingMessage, ServerResponse } from 'node:http';

export async function createContext(
  opts: NodeHTTPCreateContextFnOptions<IncomingMessage, ServerResponse>,
) {
  return { req: opts.req, res: opts.res };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
`;
}

function middlewareTemplate(): string {
  return `import { publicProcedure, middleware } from './trpc';
import { TRPCError } from '@trpc/server';

// Example: auth middleware
export const isAuthed = middleware(({ ctx, next }) => {
  // Replace with your actual auth check
  const user = (ctx as any).user;
  if (!user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user } });
});

export const protectedProcedure = publicProcedure.use(isAuthed);
`;
}

function rootRouterTemplate(): string {
  return `import { router } from './trpc';
// import { userRouter } from './routers/user';

export const appRouter = router({
  // user: userRouter,
});

export type AppRouter = typeof appRouter;
`;
}

function expressServerTemplate(superjson: boolean): string {
  return `import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './router';
import { createContext } from './context';

const app = express();

app.use(cors());
app.use(express.json());

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

app.listen(3000, () => {
  console.log('tRPC server running at http://localhost:3000');
});
`;
}

function standaloneServerTemplate(): string {
  return `import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';
import { createContext } from './context';

const server = createHTTPServer({
  router: appRouter,
  createContext,
});

server.listen(3000, () => {
  console.log('tRPC standalone server running at http://localhost:3000');
});
`;
}

function nextTrpcApiTemplate(): string {
  return `import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/router';
import { createContext } from '@/server/context';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext({ req } as any),
  });

export { handler as GET, handler as POST };
`;
}

function routerTemplate(name: string): string {
  return `import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { observable } from '@trpc/server/observable';

export const ${name}Router = router({
  // Query — fetch data
  list: publicProcedure.query(async () => {
    return [{ id: 1, name: 'Example' }];
  }),

  // Query with input validation
  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return { id: input.id, name: 'Example' };
    }),

  // Mutation — create / update / delete
  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      // persist to DB here
      return { id: Math.random(), name: input.name };
    }),

  // Subscription — real-time updates (requires WebSocket link)
  onUpdate: publicProcedure.subscription(() => {
    return observable<{ id: number; name: string }>((emit) => {
      const interval = setInterval(() => {
        emit.next({ id: Math.random(), name: 'update' });
      }, 1000);
      return () => clearInterval(interval);
    });
  }),
});
`;
}

function prismaContextTemplate(): string {
  return `import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function createContext() {
  return { prisma };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
`;
}

function nextClientTemplate(superjson: boolean): string {
  const sjImport = superjson ? "\nimport superjson from 'superjson';" : '';
  const sjTransformer = superjson ? '\n  transformer: superjson,' : '';

  return `'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { useState } from 'react';${sjImport}
import type { AppRouter } from '@/server/router';

export const trpc = createTRPCReact<AppRouter>();

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',${sjTransformer}
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
`;
}

// ─── Command: init ───────────────────────────────────────────────────────────

interface InitOptions {
  adapter: string;
  superjson: boolean;
  errorFormatter: boolean;
}

function runInit(opts: InitOptions) {
  const { adapter, superjson, errorFormatter } = opts;

  console.log(chalk.bold('\n🔧 Generating tRPC setup...\n'));
  info(`Adapter: ${chalk.yellow(adapter)}`);
  info(`Superjson: ${chalk.yellow(String(superjson))}`);
  info(`Error formatter: ${chalk.yellow(String(errorFormatter))}`);

  printFile('src/trpc.ts', trpcInitTemplate({ adapter, superjson, errorFormatter }));
  printFile('src/context.ts', contextTemplate(adapter));
  printFile('src/middleware.ts', middlewareTemplate());
  printFile('src/router.ts', rootRouterTemplate());

  if (adapter === 'express') {
    printFile('src/server.ts', expressServerTemplate(superjson));
  } else if (adapter === 'standalone') {
    printFile('src/server.ts', standaloneServerTemplate());
  } else if (adapter === 'next') {
    printFile('src/app/api/trpc/[trpc]/route.ts', nextTrpcApiTemplate());
  }

  console.log(chalk.bold('\n📦 Install dependencies:\n'));
  const deps = ['@trpc/server', '@trpc/client', 'zod'];
  if (superjson) deps.push('superjson');
  if (adapter === 'express') deps.push('@trpc/server', 'express', 'cors', '@types/express', '@types/cors');
  if (adapter === 'fastify') deps.push('@trpc/server', 'fastify', '@trpc/server');
  console.log(chalk.gray(`npm install ${deps.join(' ')}`));
  console.log();
  success('Done! Copy the file contents above into your project.');
}

// ─── Command: preset ─────────────────────────────────────────────────────────

function runPreset(name: string) {
  console.log(chalk.bold(`\n📦 Preset: ${chalk.cyan(name)}\n`));

  switch (name) {
    case 'nextjs': {
      info('Next.js App Router + React Query preset');

      printFile('src/server/trpc.ts', trpcInitTemplate({ adapter: 'next', superjson: true, errorFormatter: true }));
      printFile('src/server/context.ts', contextTemplate('next'));
      printFile('src/server/middleware.ts', middlewareTemplate());
      printFile('src/server/router.ts', rootRouterTemplate());
      printFile('src/app/api/trpc/[trpc]/route.ts', nextTrpcApiTemplate());
      printFile('src/components/TRPCProvider.tsx', nextClientTemplate(true));

      console.log(chalk.bold('\n📦 Install:\n'));
      console.log(chalk.gray('npm install @trpc/server @trpc/client @trpc/react-query @tanstack/react-query superjson zod'));
      break;
    }

    case 'express': {
      info('Express adapter + CORS preset');

      printFile('src/trpc.ts', trpcInitTemplate({ adapter: 'express', superjson: false, errorFormatter: true }));
      printFile('src/context.ts', contextTemplate('express'));
      printFile('src/middleware.ts', middlewareTemplate());
      printFile('src/router.ts', rootRouterTemplate());
      printFile('src/server.ts', expressServerTemplate(false));

      console.log(chalk.bold('\n📦 Install:\n'));
      console.log(chalk.gray('npm install @trpc/server @trpc/client express cors zod'));
      console.log(chalk.gray('npm install -D @types/express @types/cors'));
      break;
    }

    case 'standalone': {
      info('Standalone HTTP server preset');

      printFile('src/trpc.ts', trpcInitTemplate({ adapter: 'standalone', superjson: false, errorFormatter: false }));
      printFile('src/context.ts', contextTemplate('standalone'));
      printFile('src/middleware.ts', middlewareTemplate());
      printFile('src/router.ts', rootRouterTemplate());
      printFile('src/server.ts', standaloneServerTemplate());

      console.log(chalk.bold('\n📦 Install:\n'));
      console.log(chalk.gray('npm install @trpc/server @trpc/client zod'));
      break;
    }

    case 'fullstack': {
      info('T3-style: Next.js + Prisma context preset');

      printFile('src/server/trpc.ts', trpcInitTemplate({ adapter: 'next', superjson: true, errorFormatter: true }));
      printFile('src/server/context.ts', prismaContextTemplate());
      printFile('src/server/middleware.ts', middlewareTemplate());
      printFile('src/server/router.ts', rootRouterTemplate());
      printFile('src/app/api/trpc/[trpc]/route.ts', nextTrpcApiTemplate());
      printFile('src/components/TRPCProvider.tsx', nextClientTemplate(true));

      console.log(chalk.bold('\n📦 Install:\n'));
      console.log(chalk.gray('npm install @trpc/server @trpc/client @trpc/react-query @tanstack/react-query superjson zod @prisma/client'));
      console.log(chalk.gray('npm install -D prisma'));
      console.log(chalk.gray('npx prisma init'));
      break;
    }

    default: {
      console.log(chalk.red(`Unknown preset: "${name}"`));
      console.log(chalk.gray('\nAvailable presets: nextjs, express, standalone, fullstack'));
      process.exit(1);
    }
  }

  console.log();
  success('Done! Copy the file contents above into your project.');
}

// ─── Command: router ─────────────────────────────────────────────────────────

interface RouterOptions {
  name: string;
}

function runRouter(opts: RouterOptions) {
  const { name } = opts;

  console.log(chalk.bold(`\n🔀 Generating router: ${chalk.cyan(name)}\n`));

  printFile(`src/routers/${name}.ts`, routerTemplate(name));

  console.log(chalk.bold('\n📎 Add to your root router (src/router.ts):\n'));
  console.log(chalk.gray(`import { ${name}Router } from './routers/${name}';`));
  console.log(chalk.gray(''));
  console.log(chalk.gray('export const appRouter = router({'));
  console.log(chalk.gray(`  ${name}: ${name}Router,`));
  console.log(chalk.gray('});'));
  console.log();
  success('Done!');
}

// ─── CLI setup ───────────────────────────────────────────────────────────────

program
  .name('trpc-config')
  .description(chalk.cyan('Generate type-safe tRPC configuration for your project'))
  .version('1.0.0');

program
  .command('init')
  .description('Generate tRPC setup: router, context, middleware, trpc.ts init file')
  .option(
    '-a, --adapter <adapter>',
    'Adapter to use: express | fastify | next | standalone',
    'standalone',
  )
  .option('--superjson', 'Add superjson transformer', false)
  .option('--error-formatter', 'Add custom error formatter', false)
  .action((opts) => {
    const validAdapters = ['express', 'fastify', 'next', 'standalone'];
    if (!validAdapters.includes(opts.adapter)) {
      console.log(chalk.red(`Invalid adapter: "${opts.adapter}"`));
      console.log(chalk.gray(`Valid adapters: ${validAdapters.join(', ')}`));
      process.exit(1);
    }
    runInit({
      adapter: opts.adapter,
      superjson: opts.superjson,
      errorFormatter: opts.errorFormatter,
    });
  });

program
  .command('preset <name>')
  .description('Named preset: nextjs | express | standalone | fullstack')
  .action((name: string) => {
    runPreset(name);
  });

program
  .command('router')
  .description('Generate a router template with example procedures (query, mutation, subscription)')
  .option('-n, --name <name>', 'Router name (camelCase)', 'example')
  .action((opts) => {
    runRouter({ name: opts.name });
  });

program.parse(process.argv);
