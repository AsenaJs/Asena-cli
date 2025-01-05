export class ServiceHandler {

    private _code:string;

    public constructor(code:string) {
        this._code = code;
    }

    public addService(serviceName:string) {
        const service = `\n@Service()\nexport class ${serviceName} {\n\n}`;

        this._code = this._code + service;

        return this;
    }

    public get code() {
        return this._code;
    }

}