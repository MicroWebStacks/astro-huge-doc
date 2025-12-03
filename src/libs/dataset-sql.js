import {existsSync} from 'node:fs';
import duckdb from 'duckdb';
import {config} from '@/config.js';

const DATASET_SCHEMA = 'dataset';

let connectionPromise = null;

function runStatement(connection, sql) {
    return new Promise((resolve, reject) => {
        connection.run(sql, (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

function normalizeRow(row) {
    if (!row) {
        return row;
    }
    return Object.fromEntries(
        Object.entries(row).map(([key, value]) => {
            if (typeof value === 'bigint') {
                const asNumber = Number(value);
                return [key, Number.isSafeInteger(asNumber) ? asNumber : value.toString()];
            }
            return [key, value];
        })
    );
}

function runQuery(connection, sql) {
    return new Promise((resolve, reject) => {
        connection.all(sql, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }
            const normalized = (rows ?? []).map(normalizeRow);
            resolve(normalized);
        });
    });
}

async function bootstrapConnection(connection, dbPath) {
    const escapedPath = dbPath.replace(/'/g, "''");
    const statements = [
        'INSTALL sqlite',
        'LOAD sqlite',
        `ATTACH '${escapedPath}' AS ${DATASET_SCHEMA} (TYPE SQLITE)`
    ];
    for (const statement of statements) {
        await runStatement(connection, statement);
    }
}

function createConnection() {
    if (!existsSync(config.collect.db_path)) {
        throw new Error(`dataset-sql: missing database at ${config.collect.db_path}`);
    }
    return new Promise((resolve, reject) => {
        const db = new duckdb.Database(':memory:', (initError) => {
            if (initError) {
                reject(initError);
                return;
            }
            const connection = db.connect();
            bootstrapConnection(connection, config.collect.db_path)
                .then(() => resolve(connection))
                .catch((bootstrapError) => {
                    connection.close(() => {
                        reject(bootstrapError);
                    });
                });
        });
    });
}

async function getConnection() {
    if (!connectionPromise) {
        connectionPromise = createConnection();
    }
    return connectionPromise;
}

export async function queryDataset(sql) {
    if (typeof sql !== 'string' || !sql.trim()) {
        throw new Error('dataset-sql: SQL query must be a non-empty string');
    }
    const connection = await getConnection();
    return runQuery(connection, sql);
}

export {DATASET_SCHEMA};
