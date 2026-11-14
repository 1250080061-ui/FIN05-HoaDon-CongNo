using Microsoft.AspNetCore.Mvc.Filters;

namespace Fin05.Api.Services;

// This application runs as one Development API process. Serialize complete remote workflows, not just SQL preparation.
public sealed class UserAdminWriteFilter : IAsyncActionFilter
{
    private readonly SemaphoreSlim gate = new(1, 1);
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (HttpMethods.IsGet(context.HttpContext.Request.Method)) { await next(); return; }
        await gate.WaitAsync(context.HttpContext.RequestAborted);
        try { await next(); } finally { gate.Release(); }
    }
}
