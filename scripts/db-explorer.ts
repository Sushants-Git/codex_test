import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const uri = process.env.MONGODB_URI

async function main() {
    const client = new MongoClient(uri);

    try {
        await client.connect();

        const adminDb = client.db().admin();
        const databases = await adminDb.listDatabases();

        for (const dbInfo of databases.databases) {
            const db = client.db(dbInfo.name);
            const collections = await db.listCollections().toArray();

            console.log(`\nDatabase: ${dbInfo.name}`);
            if (collections.length === 0) {
                console.log("  (no collections)");
                continue;
            }

            for (const coll of collections) {
                console.log(`  Collection: ${coll.name}`);

                const indexes = await db.collection(coll.name).indexes();
                if (indexes.length > 0) {
                    console.log(
                        `    Indexes: ${indexes
                            .map(
                                (idx) =>
                                    `${idx.name} => ${JSON.stringify(idx.key)}`
                            )
                            .join(", ")}`
                    );
                }

                const sampleDocs = await db
                    .collection(coll.name)
                    .find()
                    .limit(3)
                    .toArray();
                if (sampleDocs.length === 0) {
                    console.log("    (no documents)");
                } else {
                    sampleDocs.forEach((doc, idx) => {
                        console.log(
                            `    Document #${idx + 1}: ${JSON.stringify(doc, null, 2)}`
                        );
                    });
                }
            }
        }
    } catch (error) {
        console.error("MongoDB exploration failed:", error);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

void main();
