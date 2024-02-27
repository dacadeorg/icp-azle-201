import { logout } from "./auth";

class IcHttp {
    #agent;
    #decoder;
    #encoder;

    constructor(agent) {
        this.#agent = agent;
        this.#decoder = new TextDecoder('utf-8');
        this.#encoder = new TextEncoder();
    }

    async GET(req) {
        return await this.#doRequest(req.path, "GET", req.params);
    }

    async POST(req) {
        return await this.#doRequest(req.path, "POST", req.params, req.data);
    }

    async #doRequest(path, method, params, data) {
        try {
            const queryParams = new URLSearchParams(params ? params : {});
            const url = params ? `${path}?${queryParams}` : path;
            let response;
            switch (method) {
                case "GET":
                    response = await this.#agent.http_request({
                        url,
                        method,
                        body: [],
                        headers: [],
                        certificate_version: [],
                    });
                    return this.#parseResponse(response);
                case "POST":
                case "PUT":
                case "DELETE":
                    const body = data ? this.#encoder.encode(JSON.stringify(data)) : [];
                    response = await this.#agent.http_request_update({
                        url,
                        method,
                        body,
                        headers: [['Content-Type', 'application/json; charset=utf-8'], ['Content-Length', `${body.length}`]],
                        certificate_version: [],
                    });
                    return this.#parseResponse(response);
                default:
                    throw new Error(`Unknown method: ${method}`);
            }
        } catch (err) {
            if (err.name === 'AgentHTTPResponseError') {
                logout();
            }
        }
    }

    #parseResponse(response) {
        try {
            const body = this.#decoder.decode(response.body);
            if (response.status_code !== 200) {
                throw new Error(body);
            }
            const contentType = response.headers.filter(header => "content-type" === header[0].toLowerCase()).map(header => header[1]);
            if (contentType && contentType.length === 1 && contentType[0].toLowerCase() === 'application/json; charset=utf-8') {
                return JSON.parse(body);
            }
            return body;
        } catch (err) {
            throw err;
        }
    }
}
export default IcHttp;