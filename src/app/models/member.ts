export interface Member {
	id: string;
	icNo: string;
	name: string;
	email: string;
	phone: string;
	registrationDate: string;
	status: 'active' | 'suspended';
	borrowingLimit: number;
}
