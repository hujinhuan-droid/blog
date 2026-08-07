import { parseArgs } from "node:util";
import { fixTopField, isInfoExist } from "../lib/db-migration";
import { runLocalDbMigrate } from "../tasks/db-migrate-local";

export async function runDbCommand(args: string[]) {
  const [subcommand] = args;
  const { values } = parseArgs({
    args: args.slice(1),
    options: {
      db: { type: "string", default: "ai-agent" },
    },
    strict: false,
  });
  const dbName = (values.db as string) || "ai-agent";

  if (subcommand === "migrate") {
    await runLocalDbMigrate(dbName);
    return;
  }

  if (subcommand === "fix-top-field") {
    const infoExists = await isInfoExist("local", dbName);
    await fixTopField("local", dbName, infoExists);
    return;
  }

  console.log("Database commands:\n  ai-agent db migrate\n  ai-agent db fix-top-field");
}
