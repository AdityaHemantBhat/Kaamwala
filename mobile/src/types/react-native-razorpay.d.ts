declare module 'react-native-razorpay' {
  interface RazorpayCheckoutOptions {
    key: string;
    amount: string;
    currency?: string;
    name?: string;
    description?: string;
    image?: string;
    order_id?: string;
    prefill?: {
      name?: string;
      email?: string;
      contact?: string;
    };
    notes?: Record<string, string>;
    theme?: {
      color?: string;
    };
  }

  interface RazorpayCheckoutResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  const RazorpayCheckout: {
    open: (
      options: RazorpayCheckoutOptions,
      successCallback?: (data: RazorpayCheckoutResponse) => void,
      failureCallback?: (error: any) => void
    ) => Promise<RazorpayCheckoutResponse>;
  };

  export { RazorpayCheckout };
  export default RazorpayCheckout;
}
