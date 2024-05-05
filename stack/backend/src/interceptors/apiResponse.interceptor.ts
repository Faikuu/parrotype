import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';


@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const statusCode = context.switchToHttp().getResponse().statusCode;
        console.log("Status code: ", context.switchToHttp().getResponse().statusCode);
        return next.handle().pipe(
            map((data) => ({
                status: statusCode,
                data: this.isDataArray(data) ? data : [data],
                errors: null,
            })),
        );
    }

    isDataArray(data: any) {
        return Array.isArray(data);
    }
}