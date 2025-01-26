export interface Tool {
    type: string;
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: {
        [key: string]: {
          type: string;
          description: string;
        };
      };
      required: string[];
    };
}

export interface Transcript {
    text: string;
    timestamp: Date;
    interim?: boolean;
}

export interface ModelResponse {
    text: string;
    timestamp: Date;
    complete: boolean;
}

export interface ActiveTool {
    name: string;
    message: string;
    timestamp: Date;
}

export interface RealtimeEvent {
    type: string;
    part?: {
        transcript?: string;
    };
    delta?: {
        text: string;
    };
    function_call_arguments?: string;
    tool_calls?: Array<{
        id: string;
        function: {
        name: string;
        arguments: string;
        };
    }>;
    message?: string;
}