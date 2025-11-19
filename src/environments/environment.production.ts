export const environment = {
    production: true,
    apiUrl: 'https://your-production-api.com',
    apiEndpoints: {
      auth: {
        login: '/auth/login',
        register: '/auth/register',
        refresh: '/auth/refresh',
        logout: '/auth/logout',
        google: '/auth/google',
        github: '/auth/github',
        microsoft: '/auth/microsoft',
        callback: '/auth/oauth/callback',
        me: '/auth/me',
        avatarUpload: '/auth/me/avatar'
      },
      users: '/users'
    }
  };