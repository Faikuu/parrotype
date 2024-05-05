import { excludeCookies } from "@utils/cookies";

export type ApiResponse<T> = {
    status: number;
    data: T[]; 
    message: string;
    errors: [unknown] | null
} 

type TApiMethod = "POST" | "GET" | "PUT" | "PATCH" | "DELETE"; 

type TRequiredBodyApiMethod = "POST" | "PUT" | "PATCH"; 

export type TApiCallParams<T extends TApiMethod = TApiMethod> = {
    url: `/${string}`, 
    method: T, 
    body?: T extends TRequiredBodyApiMethod ? unknown : undefined; 
    config?: RequestInit
}

function isResponseOk<TData>(response: ApiResponse<TData>) {
    return response.status >= 200 && response.status < 300; 
}

export async function apiCall<TData>({url, method, body, config}: TApiCallParams): Promise<TData> {
    const headers = {
        'Content-Type': 'application/json',
        'Cookie': excludeCookies()
    }; 
    
    const response = await fetch(import.meta.env.VITE_API_URL + url, {
        method: method,
        headers,
        credentials: 'include', 
        body: JSON.stringify(body),
        ...config
    }); 
    
    const jsonResponse: ApiResponse<TData> = await response.json(); 

    if(isResponseOk<TData>(jsonResponse))
    {
        return {data: jsonResponse.data, status: jsonResponse.status} as TData; 
    } else {
        const errorString: string = jsonResponse.errors != null ? jsonResponse.errors.map((error: any) => {
            return error.message; 
        }).join(",") : ""; 
        throw new Error(errorString); 
    }
}