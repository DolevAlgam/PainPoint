// Auth error handler utility for Supabase auth errors

// Map of error codes to user-friendly messages
const errorMessages: Record<string, string> = {
  // Sign-in errors
  'auth/invalid-email': 'The email address is not valid.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with this email address.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-login-credentials': 'Invalid email or password. Please check your credentials.',
  'auth/too-many-requests': 'Too many unsuccessful login attempts. Please try again later.',
  
  // Sign-up errors
  'auth/email-already-in-use': 'An account already exists with this email address.',
  'auth/weak-password': 'Password is too weak. Please use a stronger password.',
  
  // Password reset errors
  'auth/expired-action-code': 'The password reset link has expired. Please request a new one.',
  'auth/invalid-action-code': 'The password reset link is invalid. Please request a new one.',
  
  // General errors
  'auth/network-request-failed': 'Network error. Please check your internet connection and try again.',
  'auth/internal-error': 'An internal error occurred. Please try again later.',
  'auth/popup-closed-by-user': 'The authentication popup was closed. Please try again.',
  'auth/operation-not-allowed': 'This operation is not allowed.',
};

/**
 * Gets a user-friendly error message from a Supabase auth error
 * 
 * @param error The error object from Supabase
 * @returns A user-friendly error message
 */
export function getAuthErrorMessage(error: any): string {
  if (!error) return 'An unknown error occurred';
  
  // Check if it's a Supabase auth error with a code
  if (error.code && errorMessages[error.code]) {
    return errorMessages[error.code];
  }
  
  // Handle common Supabase error messages by checking the error message text
  const errorMessage = error.message || error.toString();
  const status = error.status || (error.response?.status || 0);
  
  // Handle HTTP status codes
  if (status === 500) {
    return 'A server error occurred. Please try again later or contact support.';
  }
  
  if (errorMessage.includes('Email not confirmed')) {
    return 'Please check your email to confirm your account before logging in.';
  }
  
  if (errorMessage.includes('Invalid login credentials')) {
    return 'Invalid email or password. Please check your credentials.';
  }
  
  if (errorMessage.includes('Email already registered')) {
    return 'An account with this email already exists.';
  }
  
  if (errorMessage.includes('Password should be')) {
    return 'Your password is too weak. Please use at least 6 characters with a mix of letters, numbers, and symbols.';
  }
  
  // Database-related errors
  if (errorMessage.includes('database') || 
      errorMessage.includes('Database') || 
      errorMessage.includes('db error') || 
      errorMessage.includes('constraint')) {
    return 'There was an issue with our database. Please try again later or contact support.';
  }
  
  // Return the original error message if no specific handling
  return errorMessage || 'An error occurred. Please try again.';
} 