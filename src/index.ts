import { indexGithubRepo } from './load-repo';
import prisma from './prisma/src';
import { publisher, client } from './redis';

async function processRedisQueue() {
    try {
        if (!client.isOpen) await client.connect();
        if (!publisher.isOpen) await publisher.connect();

        while (true) {
            try {
                const payload = await client.brPop("redisQueue", 0);

                if (!payload) {
                    console.warn('No message received');
                    continue;
                }

                const message = payload.element; 
                let data;
                try {
                    data = JSON.parse(message);
                } catch (parseError) {
                    console.error(`Error parsing message: ${parseError}`);
                    continue;
                }

                const { githubUrl, githubToken, name, userId, uniqueId } = data;

                // console.log(
                //     githubToken, "githubToken",
                //     githubUrl, "githubUrl",
                //     name, "name",
                //     userId, "userId",
                //     uniqueId, "uniqueId"
                // );

                try {
                    const project = await prisma.project.create({
                        data: {
                            githubUrl,
                            name,
                            userToProject: {
                                create: { userId },
                            },
                            deletedAt: null,
                        },
                    });

                    await indexGithubRepo(project.id, githubUrl, githubToken);

                    await publisher.publish(uniqueId, JSON.stringify({ status: 'project created', statusCode: 201 }));
                    console.log("Iam doneeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
                    
                } catch (error) {
                    console.error('Error creating project:', error);
                    await publisher.publish(uniqueId, JSON.stringify({ status: error, statusCode: 400 }));
                    console.log("error creating project----------------------------------");
                    
                }
            } catch (err) {
                console.error('Error processing Redis queue item:', err);
            }
        }
    } catch (globalError) {
        console.error('Unexpected error in processing Redis queue:', globalError);
    } finally {
        console.log('Shutting down Redis connections...');
        if (client.isOpen) await client.disconnect();
        if (publisher.isOpen) await publisher.disconnect();
    }
}

processRedisQueue().catch((error) => {
    console.error('Unexpected top-level error:', error);
});


//     const docs = await loadGithubRepo(githubUrl, githubToken);
//     const allEmbeddings = await generateEmbeddings(docs)
//     await Promise.allSettled(allEmbeddings.map(async (x) => {
//         if (!x) {
//             console.log("no embeddings")
//             return
//         }

//         const sourceCodeEmbedding = await prisma.sourceCodeEmbedding.create({
//             data: {
//                 fileName: x.fileName,
//                 summary: x.summary,
//                 projectId,
//                 sourceCode: x.sourceCode
//             }
//         })

//         //GPT code
//         await prisma.$executeRaw`
//             UPDATE "SourceCodeEmbedding"
//             SET "summaryEmbedding" = ${x.embedding}::vector
//             WHERE "id" = ${sourceCodeEmbedding.id}
//             `
//     }))
// }

// const loadGithubRepo = async (githubUrl: string, githubToken?: string) => {
//     const loader = new GithubRepoLoader(githubUrl, {
//         accessToken: githubToken || process.env.GITHUB_TOKEN,
//         branch: 'master',
//         ignoreFiles: ["package-lock.json", 'yarn.lock', 'pnpm-lock.json', 'bun.lockb'],
//         recursive: true,
//         unknown: 'warn',
//         maxConcurrency: 5
//     })

//     const docs = await loader.load();
//     return docs
// }

// const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// const generateEmbeddings = async (docs: Document[]) => {
//     const results = [];
//     for (const x of docs) {
//         const summary = await summariseCode(x);
//         await delay(50);
//         const embedding = await generateEmbedding(summary);
//         results.push({
//             summary,
//             embedding,
//             sourceCode: JSON.stringify(x.pageContent),
//             fileName: x.metadata.source
//         });
//     }
//     return results;
// };