import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Link } from "wouter";

const schema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { setUser } = useAuth();
  const [, setLocation] = useLocation();
  const loginMutation = useLogin();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = (values: FormValues) => {
    loginMutation.mutate({ data: values }, {
      onSuccess: (data) => {
        const user = (data as { user: { id: number; username: string; displayName: string; createdAt: string } }).user;
        setUser(user);
        const returnTo = sessionStorage.getItem("returnTo");
        sessionStorage.removeItem("returnTo");
        setLocation(returnTo ?? "/");
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error ?? "Login failed";
        form.setError("password", { message: msg });
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/wg-logo.png" alt="Whiskey Golf" className="w-24 h-auto mb-2" />
          <h1 className="text-2xl font-bold text-foreground">Whiskey Golf</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-username" placeholder="your-username" autoComplete="username" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" data-testid="input-password" placeholder="••••••••" autoComplete="current-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                data-testid="button-login"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          No account?{" "}
          <Link href="/register" className="text-primary hover:underline font-medium">Create one</Link>
        </p>
      </div>
    </div>
  );
}
