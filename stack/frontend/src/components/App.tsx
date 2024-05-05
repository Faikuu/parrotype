import { useMutation, useQuery } from '@tanstack/react-query';
import { PostDto } from '@schemas/post';
import { apiCall } from '@utils/api';
import { useEffect } from 'react';

export function AppComponent() {
  const login = async () => {
    return await apiCall<any>({url: '/auth/login', method: 'POST', body: {username: "test", password: "test"}});
  };
  const loginMutation = useMutation({
    mutationKey: ['login'],
    mutationFn: login,
  });
  useEffect(() => {
    loginMutation.mutate();
  }, []);

  const fetchHelloWorld = async () => {
    return await apiCall<any>({url: '/helloworld', method: 'GET'});
  };
  const { data: helloWorldString = '' } = useQuery({
    queryKey: ['helloworld'],
    queryFn: fetchHelloWorld,
  });

  const fetchPosts = async () => {
    return await apiCall<any>({url: '/feed', method: 'GET'})
  };
  const { data: Posts = [] } = useQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  });

  return (
    <div>
      {/* Other content */}
      <div className="flex justify-center items-center p-3">
        <div className="bg-gray-800 rounded-lg shadow-md p-8">
          <p className="text-3xl text-crimson">{helloWorldString}</p>
        </div>
      </div>
      <div className="rounded-lg">
        {/* Rendering Posts */}
        {Posts.map((post:PostDto) => (
          <div key={post.id} className="bg-gray-800 rounded-lg shadow-md p-8 mb-4">
            <p className="text-3xl text-crimson">{post.id}|{post.title}|{post.content}|{post.author}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
