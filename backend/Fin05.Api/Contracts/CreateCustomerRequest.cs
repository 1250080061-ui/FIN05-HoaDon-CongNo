using System.ComponentModel.DataAnnotations;

namespace Fin05.Api.Contracts;

public class CreateCustomerRequest
{
    [Required(ErrorMessage = "Vui lòng nhập mã khách hàng.")]
    [StringLength(30, ErrorMessage = "Mã khách hàng tối đa 30 ký tự.")]
    public string CustomerCode { get; init; } = "";
    [Required(ErrorMessage = "Vui lòng nhập tên khách hàng.")]
    [StringLength(200, ErrorMessage = "Tên khách hàng tối đa 200 ký tự.")]
    public string CustomerName { get; init; } = "";
    [StringLength(30)] public string? TaxCode { get; init; }
    [StringLength(20)] public string? Phone { get; init; }
    [StringLength(254)]
    [EmailAddress(ErrorMessage = "Địa chỉ email không hợp lệ.")]
    public string? Email { get; init; }
    [StringLength(500)] public string? Address { get; init; }
}
