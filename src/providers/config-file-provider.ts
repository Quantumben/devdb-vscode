import * as vscode from 'vscode';
import { DatabaseEngine, DatabaseEngineProvider, EngineProviderCache, EngineProviderOption, MysqlConfig, PostgresConfig, SqliteConfig } from '../types';
import { getConfigFileContent } from '../services/config-service';
import { brief } from '../services/string';
import { MysqlEngine } from '../database-engines/mysql-engine';
import { getConnectionFor } from '../services/sequelize-connector';
import { PostgresEngine } from '../database-engines/postgres-engine';
import { SqliteJsEngine } from '../database-engines/sqlite.js-engine';

export const ConfigFileProvider: DatabaseEngineProvider = {
	name: 'Config File',
	type: 'sqlite',
	id: 'config-file-provider',
	description: 'Databases defined in your config file',
	engine: undefined,
	cache: undefined,

	async boot(): Promise<void> {
		this.cache = undefined
		this.engine = undefined
	},

	async canBeUsedInCurrentWorkspace(): Promise<boolean> {

		const configContent: (SqliteConfig | MysqlConfig | PostgresConfig)[] | undefined = await getConfigFileContent()
		if (!configContent) return false
		if (!configContent.length) return false
		if (!this.cache) this.cache = []

		for (const config of configContent) {
			if (config.type === 'sqlite') {
				const connection = await sqliteConfigResolver(config)
				if (connection) this.cache.push(connection)
			}

			if (config.type === 'mysql' || config.type === 'mariadb') {
				if (!config.name) {
					const db = config.type === 'mysql' ? 'MySQL' : 'MariaDB'
					await vscode.window.showErrorMessage(`The ${db} config file entry ${config.name || ''} does not have a name.`)
					return false
				}
				const connection: EngineProviderCache | undefined = await mysqlConfigResolver(config)
				if (connection) this.cache.push(connection)
			}

			if (config.type === 'postgres') {
				if (!config.name) {
					await vscode.window.showErrorMessage(`The Postgres config file entry ${config.name || ''} does not have a name.`)
					return false
				}
				const connection: EngineProviderCache | undefined = await postgresConfigResolver(config)
				if (connection) this.cache.push(connection)
			}
		}

		return this.cache.length > 0
	},

	async getDatabaseEngine(option: EngineProviderOption): Promise<DatabaseEngine | undefined> {
		if (option) {
			const matchedOption = this.cache?.find((cache) => cache.id === option.option.id)
			if (!matchedOption) {
				await vscode.window.showErrorMessage(`Could not find option with id ${option.option.id}`)
				return
			}

			this.engine = matchedOption.engine
		}

		if (this.engine?.boot) {
			await this.engine.boot()
		}

		return this.engine
	}
}

async function sqliteConfigResolver(sqliteConnection: SqliteConfig): Promise<EngineProviderCache | undefined> {
	const engine: SqliteJsEngine = new SqliteJsEngine(sqliteConnection.path)
	await engine.boot()
	const isOkay = (await engine.isOkay())
	if (!isOkay || !engine.getDatabase()) {
		await vscode.window.showErrorMessage('The SQLite database specified in your config file is not valid.')
		return
	} else {
		return {
			id: sqliteConnection.path,
			description: brief(sqliteConnection.path),
			details: sqliteConnection.path,
			engine: engine
		}
	}
}

async function mysqlConfigResolver(mysqlConfig: MysqlConfig): Promise<EngineProviderCache | undefined> {
	const connection = await getConnectionFor('mysql', mysqlConfig.host, mysqlConfig.port, mysqlConfig.username, mysqlConfig.password, mysqlConfig.database)
	if (!connection) return

	const engine: MysqlEngine = new MysqlEngine(connection)
	const isOkay = (await engine.isOkay())
	if (!isOkay || !engine.sequelize) {
		await vscode.window.showErrorMessage(`The MySQL connection ${mysqlConfig.name || ''} specified in your config file is not valid.`)
		return
	}

	return {
		id: mysqlConfig.name,
		description: mysqlConfig.name,
		engine: engine
	}
}

async function postgresConfigResolver(postgresConfig: PostgresConfig): Promise<EngineProviderCache | undefined> {
	const connection = await getConnectionFor('postgres', postgresConfig.host, postgresConfig.port, postgresConfig.username, postgresConfig.password, postgresConfig.database)
	if (!connection) return

	const engine: PostgresEngine = new PostgresEngine(connection)
	const isOkay = (await engine.isOkay())
	if (!isOkay || !engine.sequelize) {
		await vscode.window.showErrorMessage(`The Postgres connection ${postgresConfig.name || ''} specified in your config file is not valid.`)
		return
	}

	return {
		id: postgresConfig.name,
		description: postgresConfig.name,
		engine: engine
	}
}