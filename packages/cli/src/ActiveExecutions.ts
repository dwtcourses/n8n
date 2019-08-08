import {
	IRun,
} from 'n8n-workflow';

import {
	createDeferredPromise,
	IExecutionsCurrentSummary,
} from 'n8n-core';

import {
	IExecutingWorkflowData,
	IWorkflowExecutionDataProcess,
} from '.';

import { ChildProcess } from 'child_process';


export class ActiveExecutions {
	private nextId = 1;
	private activeExecutions: {
		[index: string]: IExecutingWorkflowData;
	} = {};


	/**
	 * Add a new active execution
	 *
	 * @param {ChildProcess} process
	 * @param {IWorkflowExecutionDataProcess} executionData
	 * @returns {string}
	 * @memberof ActiveExecutions
	 */
	add(process: ChildProcess, executionData: IWorkflowExecutionDataProcess): string {
		const executionId = this.nextId++;

		this.activeExecutions[executionId] = {
			executionData,
			process,
			startedAt: new Date(),
			postExecutePromises: [],
		};

		return executionId.toString();
	}


	/**
	 * Remove an active execution
	 *
	 * @param {string} executionId
	 * @param {IRun} fullRunData
	 * @returns {void}
	 * @memberof ActiveExecutions
	 */
	remove(executionId: string, fullRunData?: IRun): void {
		if (this.activeExecutions[executionId] === undefined) {
			return;
		}

		// Resolve all the waiting promises
		for (const promise of this.activeExecutions[executionId].postExecutePromises) {
			promise.resolve(fullRunData);
		}

		// Remove from the list of active executions
		delete this.activeExecutions[executionId];
	}


	/**
	 * Forces an execution to stop
	 *
	 * @param {string} executionId The id of the execution to stop
	 * @returns {(Promise<IRun | undefined>)}
	 * @memberof ActiveExecutions
	 */
	async stopExecution(executionId: string): Promise<IRun | undefined> {
		if (this.activeExecutions[executionId] === undefined) {
			// There is no execution running with that id
			return;
		}

		// In case something goes wrong make sure that promise gets first
		// returned that it gets then also resolved correctly.
		setTimeout(() => {
			if (this.activeExecutions[executionId].process.connected) {
				this.activeExecutions[executionId].process.send({
					type: 'stopExecution'
				});
			}
		}, 1);

		return this.getPostExecutePromise(executionId);
	}


	/**
	 * Returns a promise which will resolve with the data of the execution
	 * with the given id
	 *
	 * @param {string} executionId The id of the execution to wait for
	 * @returns {Promise<IRun>}
	 * @memberof ActiveExecutions
	 */
	async getPostExecutePromise(executionId: string): Promise<IRun | undefined> {
		// Create the promise which will be resolved when the execution finished
		const waitPromise = await createDeferredPromise<IRun | undefined>();

		if (this.activeExecutions[executionId] === undefined) {
			throw new Error(`There is no active execution with id "${executionId}".`);
		}

		this.activeExecutions[executionId].postExecutePromises.push(waitPromise);

		return waitPromise.promise();
	}


	/**
	 * Returns all the currently active executions
	 *
	 * @returns {IExecutionsCurrentSummary[]}
	 * @memberof ActiveExecutions
	 */
	getActiveExecutions(): IExecutionsCurrentSummary[] {
		const returnData: IExecutionsCurrentSummary[] = [];

		let data;
		for (const id of Object.keys(this.activeExecutions)) {
			data = this.activeExecutions[id];
			returnData.push(
				{
					id,
					startedAt: data.startedAt,
					mode: data.executionData.executionMode,
					workflowId: data.executionData.workflowData.id! as string,
				}
			);
		}

		return returnData;
	}
}



let activeExecutionsInstance: ActiveExecutions | undefined;

export function getInstance(): ActiveExecutions {
	if (activeExecutionsInstance === undefined) {
		activeExecutionsInstance = new ActiveExecutions();
	}

	return activeExecutionsInstance;
}