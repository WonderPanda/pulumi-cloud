// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as aws from "@pulumi/aws";
import { timer } from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";

import * as callback from "./callback";

export type Action = callback.AwsCallback<() => Promise<void>>;

export function interval(name: string, options: timer.IntervalRate, handler: Action,
                         opts?: pulumi.ResourceOptions): void {
    let rateMinutes = 0;
    if (options.minutes) {
        rateMinutes += options.minutes;
    }
    if (options.hours) {
        rateMinutes += options.hours * 60;
    }
    if (options.days) {
        rateMinutes += options.days * 60 * 24;
    }

    let unit = "minutes";
    if (rateMinutes < 1) {
        throw new RunError("Interval must be at least 1 minute");
    }
    if (rateMinutes === 1) {
        unit = "minute";
    }

    createScheduledEvent(name, `rate(${rateMinutes} ${unit})`, handler, opts);
}

export function cron(name: string, cronTab: string, handler: Action,
                     opts?: pulumi.ResourceOptions): void {
    createScheduledEvent(name, `cron(${cronTab})`, handler, opts);
}

export function daily(name: string, handler: Action, opts?: pulumi.ResourceOptions): void;
export function daily(name: string, schedule: timer.DailySchedule, handler: Action, opts?: pulumi.ResourceOptions): void;
export function daily(name: string,
                      scheduleOrHandler: timer.DailySchedule | Action,
                      handlerOrOptions?: Action | pulumi.ResourceOptions,
                      opts?: pulumi.ResourceOptions): void {
    let hour: number;
    let minute: number;
    let handler: Action;
    if (isAction(scheduleOrHandler)) {
        hour = 0;
        minute = 0;
        handler = scheduleOrHandler as Action;
        opts = handlerOrOptions as pulumi.ResourceOptions | undefined;
    }
    else if (!scheduleOrHandler) {
        throw new RunError("Missing required timer handler function");
    }
    else {
        hour = scheduleOrHandler.hourUTC || 0;
        minute = scheduleOrHandler.minuteUTC || 0;
        handler = handlerOrOptions as Action;
    }
    cron(name, `${minute} ${hour} * * ? *`, handler, opts);
}

function isAction(val: any): val is Action {
    return val instanceof Function || !!(<callback.AwsCallbackData<any>>val).function;
}

export function hourly(name: string, handler: Action, opts?: pulumi.ResourceOptions): void;
export function hourly(name: string, schedule: timer.HourlySchedule, handler: Action, opts?: pulumi.ResourceOptions): void;
export function hourly(name: string,
                       scheduleOrHandler: timer.HourlySchedule | Action,
                       handlerOrOptions?: Action | pulumi.ResourceOptions,
                       opts?: pulumi.ResourceOptions): void {
    let minute: number;
    let handler: Action;
    if (isAction(scheduleOrHandler)) {
        minute = 0;
        handler = scheduleOrHandler as Action;
        opts = handlerOrOptions as pulumi.ResourceOptions | undefined;
    }
    else if (!scheduleOrHandler) {
        throw new RunError("Missing required timer handler function");
    }
    else {
        minute = scheduleOrHandler.minuteUTC || 0;
        handler = handlerOrOptions as Action;
    }
    cron(name, `${minute} * * * ? *`, handler, opts);
}

class Timer extends pulumi.ComponentResource {
    public readonly scheduleExpression: string;
    public readonly rule: aws.cloudwatch.EventRule;
    public readonly target: aws.cloudwatch.EventTarget;
    public readonly function: aws.lambda.Function;

    constructor(name: string, scheduleExpression: string, handler: Action, opts?: pulumi.ResourceOptions) {
        super("cloud:timer:Timer", name, {
            scheduleExpression: scheduleExpression,
        }, opts);

        this.scheduleExpression = scheduleExpression;

        const data = callback.getOrCreateAwsCallbackData(handler);
        const handlerFunc = data.function;

        this.function = callback.createCallbackFunction(
            name,
            (ev: any, ctx: aws.serverless.Context, cb: (error: any, result: any) => void) => {
                handlerFunc().then(
                    () => cb(null, null),
                    err => cb(err, null));
            },
            data,
            { parent: this },
        );

        this.rule = new aws.cloudwatch.EventRule(name, {
            scheduleExpression: scheduleExpression,
        }, { parent: this });
        this.target = new aws.cloudwatch.EventTarget(name, {
            rule: this.rule.name,
            arn: this.function.arn,
            targetId: name,
        }, { parent: this });
        const permission = new aws.lambda.Permission(name, {
            action: "lambda:invokeFunction",
            function: this.function,
            principal: "events.amazonaws.com",
            sourceArn: this.rule.arn,
        }, { parent: this });

        this.scheduleExpression = scheduleExpression;
    }
}

function createScheduledEvent(name: string, scheduleExpression: string, handler: Action,
                              opts?: pulumi.ResourceOptions): void {
    const t = new Timer(name, scheduleExpression, handler, opts);
}
