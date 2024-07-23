select 	gpc_sector,
		gas_name,
		gas,
		parameter_code,
		gpc_subsector,
		technical_reference_year,
		parameter_subcategory_type1,
		parameter_subcategory_typename1,
		parameter_subcategory_type2,
		parameter_subcategory_typename2,
		emissionsfactor_value,
		emissionsfactor_units,
		region,
		data_source,
		ef_id as ipcc_ef_id,
		rank() over(partition by parameter_code,parameter_subcategory_type1, parameter_subcategory_typename1,parameter_subcategory_type2, parameter_subcategory_typename2 
					order by technical_reference_year desc) as rnk
from waste_default_values
where parameter_code is not null 
and region is not null
order by parameter_code,parameter_subcategory_type1, parameter_subcategory_typename1,parameter_subcategory_type2, parameter_subcategory_typename2, technical_reference_year desc;